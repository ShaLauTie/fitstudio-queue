// netlify/functions/github-proxy.js
// All GitHub API calls go through here — token never reaches the browser

const OWNER  = process.env.GH_OWNER  || 'ShaLauTie';
const REPO   = process.env.GH_REPO   || 'fitstudio-queue';
const BRANCH = process.env.GH_BRANCH || 'main';
const TOKEN  = process.env.GITHUB_TOKEN;

const BASE = `https://api.github.com/repos/${OWNER}/${REPO}`;
const GH_HEADERS = {
    'Authorization': `Bearer ${TOKEN}`,
    'Accept':        'application/vnd.github+json',
    'Content-Type':  'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
};

const CORS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function ok(body) {
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
function err(msg, code = 500) {
    return { statusCode: code, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) };
}

exports.handler = async (event) => {
    // CORS preflight
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

    if (!TOKEN) return err('GITHUB_TOKEN environment variable not set in Netlify');

    try {
        // Parse action from query string (GET) or body (POST)
        let action, data = {};
        if (event.httpMethod === 'GET') {
            const q = event.queryStringParameters || {};
            action = q.action;
            data   = q;
        } else {
            const body = JSON.parse(event.body || '{}');
            action = body.action;
            data   = body;
        }

        // ── Upload job ──────────────────────────────────────────────────
        if (action === 'upload') {
            const { jobId, dogImage, clothesImage } = data;
            if (!jobId || !dogImage || !clothesImage) return err('Missing jobId, dogImage or clothesImage', 400);

            const content = JSON.stringify({
                jobId,
                createdAt: new Date().toISOString(),
                dogImage,
                clothesImage,
            });
            const res = await fetch(`${BASE}/contents/jobs/pending/${jobId}.json`, {
                method: 'PUT',
                headers: GH_HEADERS,
                body: JSON.stringify({
                    message: `New job ${jobId}`,
                    branch:  BRANCH,
                    content: Buffer.from(content).toString('base64'),
                }),
            });
            if (!res.ok) return err(`GitHub upload failed (${res.status}): ${await res.text()}`);
            return ok({ success: true });
        }

        // ── Poll result ─────────────────────────────────────────────────
        if (action === 'poll') {
            const { jobId } = data;
            if (!jobId) return err('Missing jobId', 400);

            const res = await fetch(`${BASE}/contents/jobs/done/${jobId}.json?ref=${BRANCH}`, {
                headers: GH_HEADERS,
            });
            if (res.status === 404) return ok({ found: false });
            if (!res.ok) return err(`GitHub poll failed (${res.status})`);

            const file   = await res.json();
            const parsed = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
            return ok({ found: true, image: parsed.resultImage, sha: file.sha });
        }

        // ── Delete file ─────────────────────────────────────────────────
        if (action === 'delete') {
            const { filePath, sha } = data;
            if (!filePath || !sha) return err('Missing filePath or sha', 400);

            await fetch(`${BASE}/contents/${filePath}`, {
                method:  'DELETE',
                headers: GH_HEADERS,
                body: JSON.stringify({ message: `Cleanup ${filePath}`, branch: BRANCH, sha }),
            });
            return ok({ success: true });
        }

        return err(`Unknown action: ${action}`, 400);

    } catch (e) {
        return err(e.message);
    }
};
