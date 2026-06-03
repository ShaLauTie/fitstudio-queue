/* ==========================================================================
   apetto FitStudio Core Interactive Script
   HTML5 Canvas Editor + Real-Time Chroma Key Background Removal
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // Core elements
    const canvas = document.getElementById('fitting-canvas');
    const ctx = canvas.getContext('2d');
    
    const fileUpload = document.getElementById('file-upload');
    const dropZone = document.getElementById('drop-zone');
    const canvasPlaceholder = document.getElementById('canvas-placeholder');
    const adjustmentSection = document.getElementById('adjustment-section');
    const exportBar = document.getElementById('export-bar');
    
    // Preset dogs
    const btnDogGolden = document.getElementById('btn-dog-golden');
    const btnDogLabrador = document.getElementById('btn-dog-labrador');
    
    // Clothes selectors
    const clothesCards = document.querySelectorAll('.clothes-card');

    const btnRealAi = document.getElementById('btn-real-ai');
    const btnExport = document.getElementById('btn-export');
    const apiIndicator = document.getElementById('api-indicator');
    const aiLoadingModal = document.getElementById('ai-loading-modal');

    // Scanner overlay
    const scannerLaser = document.getElementById('scanner-laser');
    const scannerGrid  = document.getElementById('scanner-grid');

    // App state
    let dogImage = null;
    let clothesRawImage = null;      // Holds the raw green-screen image
    let clothesTransparentImage = null; // Holds the processed transparent image
    
    // Overlay settings
    let overlayState = {
        x: 0,
        y: 0,
        scale: 1.0,         // multiplier relative to default size
        rotate: 0,          // in degrees
        opacity: 1.0,       // 0.0 to 1.0
        mirrored: false
    };
    
    // Interaction states
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let overlayStartX = 0;
    let overlayStartY = 0;

    // ==========================================================================
    // 1. Initial State / Preset Loaders
    // ==========================================================================
    
    // Dynamically inject Base64 thumbnails to avoid any CORS/file load issues
    if (typeof ASSETS_DATA !== 'undefined') {
        document.querySelector('.thumb-golden').style.backgroundImage = `url(${ASSETS_DATA.dog_golden})`;
        document.querySelector('.thumb-labrador').style.backgroundImage = `url(${ASSETS_DATA.dog_labrador})`;
        document.querySelector('#card-pink img').src = ASSETS_DATA.pink_raincoat;
        document.querySelector('#card-lime img').src = ASSETS_DATA.lime_raincoat;
        document.querySelector('#card-blue img').src = ASSETS_DATA.blue_raincoat;
    }

    // Load default golden dog preset on start
    loadDogImage(typeof ASSETS_DATA !== 'undefined' ? ASSETS_DATA.dog_golden : 'assets/dog_golden.jpg');

    btnDogGolden.addEventListener('click', () => {
        setActivePreset(btnDogGolden);
        loadDogImage(typeof ASSETS_DATA !== 'undefined' ? ASSETS_DATA.dog_golden : 'assets/dog_golden.jpg');
    });

    btnDogLabrador.addEventListener('click', () => {
        setActivePreset(btnDogLabrador);
        loadDogImage(typeof ASSETS_DATA !== 'undefined' ? ASSETS_DATA.dog_labrador : 'assets/dog_labrador.webp');
    });

    function setActivePreset(activeButton) {
        document.querySelectorAll('.btn-preset').forEach(btn => btn.classList.remove('active'));
        activeButton.classList.add('active');
        // Clear file input
        fileUpload.value = '';
    }

    // File Upload handling
    fileUpload.addEventListener('change', handleFileSelect);
    
    // Drag & Drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            fileUpload.files = e.dataTransfer.files;
            handleFileSelect();
        }
    });

    function handleFileSelect() {
        const file = fileUpload.files[0];
        if (file) {
            document.querySelectorAll('.btn-preset').forEach(btn => btn.classList.remove('active'));
            const reader = new FileReader();
            reader.onload = function(event) {
                // Show preview in upload box
                showDogPreview(event.target.result);
                loadDogImage(event.target.result);
            };
            reader.readAsDataURL(file);
        }
    }

    function showDogPreview(src) {
        const uploadPrompt  = document.getElementById('upload-prompt');
        const uploadPreview = document.getElementById('upload-preview');
        const dogPreviewImg = document.getElementById('dog-preview-img');
        if (uploadPrompt && uploadPreview && dogPreviewImg) {
            dogPreviewImg.src = src;
            uploadPrompt.style.display  = 'none';
            uploadPreview.style.display = 'flex';
        }
    }

    function loadDogImage(src) {
        dogImage = new Image();
        dogImage.onload = function() {
            // Hide placeholder once dog is loaded
            canvasPlaceholder.style.opacity = '0';
            setTimeout(() => { canvasPlaceholder.style.display = 'none'; }, 300);
            
            // Adjust canvas size to fit container aspect ratio, keeping dog aspect ratio
            resizeCanvasToFit();
            
            // If clothes are already loaded, adjust state, otherwise keep it
            if (clothesTransparentImage) {
                resetOverlayState();
            }
            
            draw();
        };
        dogImage.src = src;
    }

    function resizeCanvasToFit() {
        if (!dogImage) return;
        const container = document.getElementById('canvas-wrapper');
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        const dogAspect = dogImage.width / dogImage.height;
        const containerAspect = containerWidth / containerHeight;
        
        if (dogAspect > containerAspect) {
            // Dog is wider than container
            canvas.width = containerWidth;
            canvas.height = containerWidth / dogAspect;
        } else {
            // Dog is taller
            canvas.height = containerHeight;
            canvas.width = containerHeight * dogAspect;
        }
    }

    window.addEventListener('resize', () => {
        if (dogImage) {
            resizeCanvasToFit();
            draw();
        }
    });

    // ==========================================================================
    // 2. Clothes Selector & Chroma Key Engine
    // ==========================================================================
    
    clothesCards.forEach(card => {
        card.addEventListener('click', () => {
            clothesCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            
            let clothesSrc = card.getAttribute('data-clothes');
            if (typeof ASSETS_DATA !== 'undefined') {
                if (card.id === 'card-pink') clothesSrc = ASSETS_DATA.pink_raincoat;
                else if (card.id === 'card-lime') clothesSrc = ASSETS_DATA.lime_raincoat;
                else if (card.id === 'card-blue') clothesSrc = ASSETS_DATA.blue_raincoat;
            }
            loadClothesAndProcess(clothesSrc);
        });
    });

    function loadClothesAndProcess(src) {
        clothesRawImage = new Image();
        clothesRawImage.onload = function() {
            processChromaKey();
            exportBar.classList.remove('disabled');
            resetOverlayState();
            draw();
            // Enable the big Real AI button
            if (btnRealAi) btnRealAi.disabled = false;
            autoSmartFit();
        };
        clothesRawImage.src = src;
    }

    function autoSmartFit() {
        if (!clothesTransparentImage || !dogImage) return;
        const isGolden   = btnDogGolden.classList.contains('active');
        const isLabrador = btnDogLabrador.classList.contains('active');
        if (isGolden) {
            overlayState.x = canvas.width * 0.52;
            overlayState.y = canvas.height * 0.68;
            overlayState.scale = 1.15;
            overlayState.rotate = -4;
        } else if (isLabrador) {
            overlayState.x = canvas.width * 0.61;
            overlayState.y = canvas.height * 0.53;
            overlayState.scale = 1.25;
            overlayState.rotate = 12;
        } else {
            overlayState.x = canvas.width * 0.5;
            overlayState.y = canvas.height * 0.6;
            overlayState.scale = 1.2;
            overlayState.rotate = 0;
        }
        overlayState.mirrored = false;
        overlayState.opacity  = 1.0;
        draw();
    }


    /**
     * Chroma Key Background Removal Algorithm
     * Detects green screen pixels and replaces them with pure transparency.
     */
    function processChromaKey() {
        if (!clothesRawImage) return;
        
        // Create an offscreen canvas
        const offscreen = document.createElement('canvas');
        const oCtx = offscreen.getContext('2d');
        
        offscreen.width = clothesRawImage.width;
        offscreen.height = clothesRawImage.height;
        
        // Draw raw green-screen image
        oCtx.drawImage(clothesRawImage, 0, 0);
        
        const imgData = oCtx.getImageData(0, 0, offscreen.width, offscreen.height);
        const data = imgData.data;
        
        // Loop through pixels and remove green
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            
            // Green detection threshold:
            // Standard chroma key green check - green channel is significantly higher than red and blue
            // also check that green is high enough.
            const isGreen = g > 90 && g > r * 1.28 && g > b * 1.28;
            
            if (isGreen) {
                // Remove pixel completely (Alpha = 0)
                data[i+3] = 0;
            } else {
                // Soften edges: check pixels near green threshold and make semi-transparent for anti-aliasing
                const isEdge = g > 75 && g > r * 1.15 && g > b * 1.15;
                if (isEdge) {
                    const diff = g - Math.max(r, b);
                    data[i+3] = Math.max(0, 255 - (diff * 4));
                }
            }
        }
        
        // Put data back and store as transparent image
        oCtx.putImageData(imgData, 0, 0);
        
        clothesTransparentImage = new Image();
        clothesTransparentImage.src = offscreen.toDataURL();
    }

    // ==========================================================================
    // 3. Canvas Rendering & Calculations
    // ==========================================================================

    function resetOverlayState() {
        if (!dogImage || !clothesTransparentImage) return;
        
        // Default position: center of the canvas
        overlayState.x = canvas.width / 2;
        overlayState.y = canvas.height / 2 + (canvas.height * 0.05); // slightly lower
        
        // Default scale: make clothing height roughly 50% of the canvas height
        const targetHeight = canvas.height * 0.5;
        const rawAspect = clothesRawImage.width / clothesRawImage.height;
        const clothesHeight = canvas.width * 0.4 / rawAspect;
        
        overlayState.scale = targetHeight / clothesHeight;
        overlayState.rotate = 0;
        overlayState.opacity = 1.0;
        overlayState.mirrored = false;
    }

    function draw() {
        if (!dogImage) return;
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 1. Draw Dog Background
        ctx.drawImage(dogImage, 0, 0, canvas.width, canvas.height);
        
        // 2. Draw Clothes Overlay
        if (clothesTransparentImage && clothesTransparentImage.complete) {
            ctx.save();
            
            // Set opacity
            ctx.globalAlpha = overlayState.opacity;
            
            // Move origin to clothing position
            ctx.translate(overlayState.x, overlayState.y);
            
            // Apply rotation (convert degrees to radians)
            ctx.rotate(overlayState.rotate * Math.PI / 180);
            
            // Apply mirror/flip if needed
            const scaleX = overlayState.mirrored ? -overlayState.scale : overlayState.scale;
            ctx.scale(scaleX, overlayState.scale);
            
            // Draw clothing image centered on origin
            const drawWidth = canvas.width * 0.4;
            const drawHeight = drawWidth * (clothesRawImage.height / clothesRawImage.width);
            
            ctx.drawImage(
                clothesTransparentImage, 
                -drawWidth / 2, 
                -drawHeight / 2, 
                drawWidth, 
                drawHeight
            );
            
            ctx.restore();
        }
    }

    // ==========================================================================
    // 5. Drag and Drop Overlay Controls (Direct Canvas Interaction)
    // ==========================================================================

    canvas.addEventListener('mousedown', startDrag);
    canvas.addEventListener('mousemove', drag);
    window.addEventListener('mouseup', endDrag);
    
    // Touch support for tablets/mobile
    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            startDrag(touch);
        }
    }, { passive: true });
    
    canvas.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            drag(touch);
        }
    }, { passive: true });
    
    canvas.addEventListener('touchend', endDrag);

    function startDrag(e) {
        if (!clothesTransparentImage) return;
        
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX || e.pageX;
        const clientY = e.clientY || e.pageY;
        
        const mouseX = ((clientX - rect.left) / rect.width) * canvas.width;
        const mouseY = ((clientY - rect.top) / rect.height) * canvas.height;
        
        // Simple hit test: check if user clicked close to the center of the clothing
        const dist = Math.sqrt((mouseX - overlayState.x)**2 + (mouseY - overlayState.y)**2);
        
        // Define active clickable radius (e.g. 150px or clothing height)
        const hitRadius = canvas.width * 0.25 * overlayState.scale;
        
        if (dist < hitRadius) {
            isDragging = true;
            dragStartX = mouseX;
            dragStartY = mouseY;
            overlayStartX = overlayState.x;
            overlayStartY = overlayState.y;
        }
    }

    function drag(e) {
        if (!isDragging) return;
        
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX || e.pageX;
        const clientY = e.clientY || e.pageY;
        
        const mouseX = ((clientX - rect.left) / rect.width) * canvas.width;
        const mouseY = ((clientY - rect.top) / rect.height) * canvas.height;
        
        const dx = mouseX - dragStartX;
        const dy = mouseY - dragStartY;
        
        overlayState.x = overlayStartX + dx;
        overlayState.y = overlayStartY + dy;
        
        draw();
    }

    function endDrag() {
        isDragging = false;
    }

    // ==========================================================================
    // btnSmartFit removed — auto-fit now triggers on clothes selection


    // ==========================================================================
    // 7. Image Export Engine
    // ==========================================================================

    btnExport.addEventListener('click', () => {
        if (!dogImage || !clothesTransparentImage) return;
        
        // Create high-res download output
        const outputCanvas = document.createElement('canvas');
        const oCtx = outputCanvas.getContext('2d');
        
        // Use original dog image dimensions for high res
        outputCanvas.width = dogImage.width;
        outputCanvas.height = dogImage.height;
        
        // 1. Draw Dog at Full Res
        oCtx.drawImage(dogImage, 0, 0, outputCanvas.width, outputCanvas.height);
        
        // 2. Draw Clothes Overlay at mapped high res
        oCtx.save();
        
        // Set opacity
        oCtx.globalAlpha = overlayState.opacity;
        
        // Map current coordinates to high-res coordinates
        const scaleFactorX = dogImage.width / canvas.width;
        const scaleFactorY = dogImage.height / canvas.height;
        
        const mappedX = overlayState.x * scaleFactorX;
        const mappedY = overlayState.y * scaleFactorY;
        
        oCtx.translate(mappedX, mappedY);
        oCtx.rotate(overlayState.rotate * Math.PI / 180);
        
        // Scale includes screen-to-highres mapping
        const rawScale = overlayState.scale * scaleFactorX; 
        const scaleX = overlayState.mirrored ? -rawScale : rawScale;
        oCtx.scale(scaleX, rawScale);
        
        // Drawcentered
        const drawWidth = canvas.width * 0.4;
        const drawHeight = drawWidth * (clothesRawImage.height / clothesRawImage.width);
        
        oCtx.drawImage(
            clothesTransparentImage, 
            -drawWidth / 2, 
            -drawHeight / 2, 
            drawWidth, 
            drawHeight
        );
        
        oCtx.restore();
        
        // Download Link
        const link = document.createElement('a');
        link.download = 'apetto-fitstudio-result.png';
        link.href = outputCanvas.toDataURL('image/png');
        link.click();
    });

    // ==========================================================================
    // 8. Playwright Server Status Check
    // ==========================================================================

    // ── GitHub Bridge via Netlify Proxy (token is server-side, never in browser) ──
    const PROXY = '/api/github-proxy';

    // Compress image to reduce payload size
    function compressImage(src, maxPx = 800, quality = 0.82) {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                const ratio  = Math.min(maxPx / img.width, maxPx / img.height, 1);
                const canvas = document.createElement('canvas');
                canvas.width  = Math.round(img.width  * ratio);
                canvas.height = Math.round(img.height * ratio);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => resolve(src);
            img.src = src;
        });
    }

    // Upload job via proxy
    async function ghUploadJob(jobId, dogSrc, clothesSrc) {
        const res = await fetch(PROXY, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'upload', jobId, dogImage: dogSrc, clothesImage: clothesSrc }),
        });
        const data = await res.json();
        if (!data.success) throw new Error('上傳失敗: ' + (data.error || res.status));
    }

    // Poll result via proxy (max 6 min)
    async function ghPollResult(jobId) {
        for (let i = 0; i < 72; i++) {
            await new Promise(r => setTimeout(r, 5000));
            try {
                const res  = await fetch(`${PROXY}?action=poll&jobId=${jobId}`);
                const data = await res.json();
                if (data.found) return { image: data.image, sha: data.sha };
            } catch (_) {}
        }
        throw new Error('等待超時（6 分鐘），Gemini 未回應');
    }

    // Cleanup via proxy
    async function ghDeleteFile(filePath, sha) {
        try {
            await fetch(PROXY, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete', filePath, sha }),
            });
        } catch (_) {}
    }

    // Indicator — always connected when on Netlify
    function updateIndicator() {
        apiIndicator.className = 'api-indicator connected';
        apiIndicator.querySelector('.indicator-text').textContent = 'GitHub Bridge ✅';
    }
    updateIndicator();

    // ==========================================================================
    // 9. Real-time Progress Display (client-side timer, no network needed)
    // ==========================================================================

    let statusPollInterval = null;

    function startStatusPolling() {
        const loadingDesc = document.querySelector('.loading-desc');
        const progressBar = document.getElementById('loading-progress-bar');
        const startTime   = Date.now();

        // Each step: { sec: seconds_since_start, pct: progress_bar%, text: display_text }
        const steps = [
            { sec: 0,   pct: 8,  text: '📁 準備圖片中...' },
            { sec: 2,   pct: 18, text: '🌐 連線至 Gemini...' },
            { sec: 5,   pct: 32, text: '🐶 貼上狗狗照片...' },
            { sec: 11,  pct: 46, text: '👗 貼上雨衣圖片...' },
            { sec: 17,  pct: 58, text: '✍️ 輸入生成指令...' },
            { sec: 20,  pct: 65, text: '🚀 指令已送出！等待 Gemini 回應...' },
            { sec: 25,  pct: 70, text: '✨ Gemini AI 圖片生成中...' },
        ];

        statusPollInterval = setInterval(() => {
            const elapsed = Math.round((Date.now() - startTime) / 1000);

            // Find the highest matching step
            let current = steps[0];
            for (const s of steps) {
                if (elapsed >= s.sec) current = s;
                else break;
            }

            if (loadingDesc) {
                if (elapsed >= 25) {
                    // Show live counter during AI generation phase
                    loadingDesc.textContent = `✨ Gemini AI 生成圖片中... 已等待 ${elapsed} 秒`;
                } else {
                    loadingDesc.textContent = current.text;
                }
            }
            if (progressBar) {
                // Slowly inch toward 95% max while waiting (never reach 100 until done)
                const pct = elapsed >= 25
                    ? Math.min(95, current.pct + Math.round((elapsed - 25) * 0.3))
                    : current.pct;
                progressBar.style.width = `${pct}%`;
            }
        }, 1000);
    }

    function stopStatusPolling() {
        if (statusPollInterval) {
            clearInterval(statusPollInterval);
            statusPollInterval = null;
        }
    }


    // ==========================================================================
    // 9. API Blobs & Mask Generators
    // ==========================================================================

    /**
     * DALL-E 2 Inpainting requires square PNGs with alpha channel indicating the mask.
     */
    function generateOpenAiBlobs() {
        return new Promise((resolve, reject) => {
            try {
                const size = 1024;
                
                // 1. Square Dog Canvas
                const dogCanvas = document.createElement('canvas');
                dogCanvas.width = size;
                dogCanvas.height = size;
                const dCtx = dogCanvas.getContext('2d');
                
                // Calculate dimensions to center the dog image inside a 1024x1024 square
                const dogAspect = dogImage.width / dogImage.height;
                let dw, dh, dx, dy;
                if (dogAspect > 1) {
                    dw = size;
                    dh = size / dogAspect;
                    dx = 0;
                    dy = (size - dh) / 2;
                } else {
                    dw = size * dogAspect;
                    dh = size;
                    dx = (size - dw) / 2;
                    dy = 0;
                }
                
                // Draw dog
                dCtx.drawImage(dogImage, dx, dy, dw, dh);
                
                // 2. Square Mask Canvas
                const maskCanvas = document.createElement('canvas');
                maskCanvas.width = size;
                maskCanvas.height = size;
                const mCtx = maskCanvas.getContext('2d');
                
                // Draw dog first
                mCtx.drawImage(dogImage, dx, dy, dw, dh);
                
                // Set global composite to transparent-out where clothes are
                const scaleFactorX = dw / canvas.width;
                const scaleFactorY = dh / canvas.height;
                
                mCtx.save();
                mCtx.globalCompositeOperation = 'destination-out';
                
                const mappedX = dx + (overlayState.x * scaleFactorX);
                const mappedY = dy + (overlayState.y * scaleFactorY);
                
                mCtx.translate(mappedX, mappedY);
                mCtx.rotate(overlayState.rotate * Math.PI / 180);
                
                const rawScale = overlayState.scale * scaleFactorX;
                const scaleX = overlayState.mirrored ? -rawScale : rawScale;
                mCtx.scale(scaleX, rawScale);
                
                const drawWidth = canvas.width * 0.4;
                const drawHeight = drawWidth * (clothesRawImage.height / clothesRawImage.width);
                
                // Clear overlay pixels in mask to indicate transparent (inpainting zone)
                mCtx.drawImage(
                    clothesTransparentImage, 
                    -drawWidth / 2, 
                    -drawHeight / 2, 
                    drawWidth, 
                    drawHeight
                );
                mCtx.restore();
                
                // Convert to Blobs
                dogCanvas.toBlob((dogBlob) => {
                    maskCanvas.toBlob((maskBlob) => {
                        resolve({ dogBlob, maskBlob });
                    }, 'image/png');
                }, 'image/png');
                
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Stability AI Inpainting requires original dimensions with a black/white mask.
     */
    function generateStabilityBlobs() {
        return new Promise((resolve, reject) => {
            try {
                // 1. Dog Canvas
                const dogCanvas = document.createElement('canvas');
                dogCanvas.width = dogImage.width;
                dogCanvas.height = dogImage.height;
                const dCtx = dogCanvas.getContext('2d');
                dCtx.drawImage(dogImage, 0, 0);
                
                // 2. Mask Canvas (White where clothes are, Black where dog is)
                const maskCanvas = document.createElement('canvas');
                maskCanvas.width = dogImage.width;
                maskCanvas.height = dogImage.height;
                const mCtx = maskCanvas.getContext('2d');
                
                // Fill background with solid Black (#000000)
                mCtx.fillStyle = '#000000';
                mCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
                
                // Draw clothes shape as solid White (#FFFFFF)
                const scaleFactorX = dogImage.width / canvas.width;
                const scaleFactorY = dogImage.height / canvas.height;
                
                mCtx.save();
                mCtx.translate(overlayState.x * scaleFactorX, overlayState.y * scaleFactorY);
                mCtx.rotate(overlayState.rotate * Math.PI / 180);
                
                const rawScale = overlayState.scale * scaleFactorX;
                const scaleX = overlayState.mirrored ? -rawScale : rawScale;
                mCtx.scale(scaleX, rawScale);
                
                const drawWidth = canvas.width * 0.4;
                const drawHeight = drawWidth * (clothesRawImage.height / clothesRawImage.width);
                
                // Draw white silhouette bounding box
                mCtx.fillStyle = '#FFFFFF';
                mCtx.fillRect(-drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
                mCtx.restore();
                
                // Convert to Blobs
                dogCanvas.toBlob((dogBlob) => {
                    maskCanvas.toBlob((maskBlob) => {
                        resolve({ dogBlob, maskBlob });
                    }, 'image/png');
                }, 'image/png');
                
            } catch (err) {
                reject(err);
            }
        });
    }

    // ==========================================================================
    // 10. AI API Endpoints Callers
    // ==========================================================================

    async function callOpenAiImageEdit(apiKey, promptText) {
        const { dogBlob, maskBlob } = await generateOpenAiBlobs();
        
        const formData = new FormData();
        formData.append('image', dogBlob, 'image.png');
        formData.append('mask', maskBlob, 'mask.png');
        formData.append('prompt', promptText);
        formData.append('n', 1);
        formData.append('size', '1024x1024');
        formData.append('response_format', 'b64_json');
        
        const response = await fetch('https://api.openai.com/v1/images/edits', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            body: formData
        });
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || `HTTP 錯誤碼 ${response.status}`);
        }
        
        const resData = await response.json();
        const b64Data = resData.data[0].b64_json;
        return `data:image/png;base64,${b64Data}`;
    }

    async function callStabilityInpaint(apiKey, promptText) {
        const { dogBlob, maskBlob } = await generateStabilityBlobs();
        
        const formData = new FormData();
        formData.append('init_image', dogBlob, 'image.png');
        formData.append('mask_source', 'MASK_IMAGE_WHITE');
        formData.append('mask_image', maskBlob, 'mask.png');
        formData.append('text_prompts[0][text]', promptText);
        formData.append('text_prompts[0][weight]', '1.0');
        
        const response = await fetch('https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/image-to-image/masking', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json'
            },
            body: formData
        });
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || `HTTP 錯誤碼 ${response.status}`);
        }
        
        const resData = await response.json();
        const b64Data = resData.artifacts[0].base64;
        return `data:image/png;base64,${b64Data}`;
    }

    async function callGoogleImagen3(apiKey, promptText) {
        // Calculate aspect ratio dynamically based on current dog image
        let aspect = "1:1";
        if (dogImage) {
            const dogAspect = dogImage.width / dogImage.height;
            if (dogAspect > 1.5) aspect = "16:9";
            else if (dogAspect > 1.2) aspect = "4:3";
            else if (dogAspect < 0.6) aspect = "9:16";
            else if (dogAspect < 0.8) aspect = "3:4";
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:generateImages?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: promptText,
                numberOfImages: 1,
                outputMimeType: "image/jpeg",
                aspectRatio: aspect
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(`【Google Imagen 3 | 畫布渲染失敗】: ${errData.error?.message || `HTTP 錯誤碼 ${response.status}`}`);
        }

        const resData = await response.json();
        const b64Data = resData.generatedImages[0].image.imageBytes;
        return `data:image/jpeg;base64,${b64Data}`;
    }

    async function callGoogleGeminiMultimodalPrompt(apiKey, dogDataUrl, clothesDataUrl) {
        const dogBase64 = getBase64FromDataUrl(dogDataUrl);
        const dogMime = getMimeTypeFromDataUrl(dogDataUrl);
        
        const clothesBase64 = getBase64FromDataUrl(clothesDataUrl);
        const clothesMime = getMimeTypeFromDataUrl(clothesDataUrl);
        
        const systemPrompt = "You are an expert AI fashion stylist. Look at the dog in the first image, and the dog raincoat in the second image. Write a highly detailed, professional, photo-realistic prompt for an image generator (like Imagen 3) to generate a photo of this exact dog wearing this exact raincoat in the exact same background. Describe the dog's breed, coat, posture, the raincoat's specific color, design details, fabric folds, and how it naturally fits the dog's body. Output ONLY the English prompt text itself, do not add any markdown, notes, conversational headers, or introduction.";
        
        const models = ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-3.1-flash", "gemini-2.5-pro"];
        let lastError = null;

        for (const model of models) {
            try {
                console.log(`Trying Google Gemini model: ${model}...`);
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                {
                                    text: systemPrompt
                                },
                                {
                                    inlineData: {
                                        mimeType: dogMime,
                                        data: dogBase64
                                    }
                                },
                                {
                                    inlineData: {
                                        mimeType: clothesMime,
                                        data: clothesBase64
                                    }
                                }
                            ]
                        }]
                    })
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.error?.message || `HTTP ${response.status}`);
                }

                const resData = await response.json();
                if (!resData.candidates || !resData.candidates[0] || !resData.candidates[0].content || !resData.candidates[0].content.parts) {
                    throw new Error("Gemini 返回了空回應。");
                }
                
                const generatedPrompt = resData.candidates[0].content.parts[0].text.trim();
                return generatedPrompt;
            } catch (err) {
                console.warn(`Model ${model} failed:`, err);
                lastError = err;
            }
        }

        throw new Error(`【Google Gemini | 穿衣分析多重備援皆失敗】: 我們嘗試了所有的 Gemini 模型 (${models.join(", ")}), 但全部因流量過載或金鑰限制而失敗。最後一個錯誤為: ${lastError.message || lastError}`);
    }

    async function callGroqMultimodalPrompt(groqKey, dogDataUrl, clothesDataUrl) {
        const dogBase64 = getBase64FromDataUrl(dogDataUrl);
        const dogMime = getMimeTypeFromDataUrl(dogDataUrl);
        
        const clothesBase64 = getBase64FromDataUrl(clothesDataUrl);
        const clothesMime = getMimeTypeFromDataUrl(clothesDataUrl);
        
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${groqKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "llama-3.2-11b-vision-preview",
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: "You are an expert AI fashion stylist. Look at the dog in the first image, and the dog raincoat in the second image. Write a highly detailed, professional, photo-realistic prompt for an image generator (like Imagen 3) to generate a photo of this exact dog wearing this exact raincoat in the exact same background. Describe the dog's breed, coat, posture, the raincoat's specific color, design details, fabric folds, and how it naturally fits the dog's body. Output ONLY the English prompt text itself, do not add any markdown, notes, conversational headers, or introduction."
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:${dogMime};base64,${dogBase64}`
                                }
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:${clothesMime};base64,${clothesBase64}`
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 150
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(`【Groq LLaMA 3.2 Vision | 穿衣分析失敗】: ${errData.error?.message || `HTTP 錯誤碼 ${response.status}`}`);
        }

        const resData = await response.json();
        const generatedPrompt = resData.choices[0].message.content.trim();
        return generatedPrompt;
    }

    async function callOllamaMultimodalPrompt(dogDataUrl, clothesDataUrl) {
        const dogBase64 = getBase64FromDataUrl(dogDataUrl);
        const dogMime = getMimeTypeFromDataUrl(dogDataUrl);
        
        const clothesBase64 = getBase64FromDataUrl(clothesDataUrl);
        const clothesMime = getMimeTypeFromDataUrl(clothesDataUrl);
        
        const response = await fetch('http://localhost:11434/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "llama3.2-vision",
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: "You are an expert AI fashion stylist. Look at the dog in the first image, and the dog raincoat in the second image. Write a highly detailed, professional, photo-realistic prompt for an image generator (like Imagen 3) to generate a photo of this exact dog wearing this exact raincoat in the exact same background. Describe the dog's breed, coat, posture, the raincoat's specific color, design details, fabric folds, and how it naturally fits the dog's body. Output ONLY the English prompt text itself, do not add any markdown, notes, conversational headers, or introduction."
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:${dogMime};base64,${dogBase64}`
                                }
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:${clothesMime};base64,${clothesBase64}`
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 150
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(`【Ollama LLaMA 3.2 Vision | 本機分析失敗】: ${errData.error?.message || `HTTP 錯誤碼 ${response.status}。請確認 Ollama 已啟動，且您已下載並跑起了 llama3.2-vision 模型。`}`);
        }

        const resData = await response.json();
        const generatedPrompt = resData.choices[0].message.content.trim();
        return generatedPrompt;
    }

    async function callPlaywrightMultimodalPrompt(dogDataUrl, clothesDataUrl) {
        try {
            // 5-minute timeout — Gemini can take a while to respond
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

            const response = await fetch('/api/stylist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dogImage: dogDataUrl, clothesImage: clothesDataUrl }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP 錯誤碼 ${response.status}`);
            }

            const resData = await response.json();
            // Server returns { image: 'data:...' } for Gemini-generated image
            // or { prompt: '...' } as text fallback for Imagen 3
            return resData.image || resData.prompt;
        } catch (err) {
            if (err.name === 'AbortError') {
                throw new Error('【Playwright 超時】Gemini 回應超過 5 分鐘，請重試。若 Gemini 很忙，可稍後再試！');
            }
            throw new Error(`【Playwright 本機自動化失敗】: ${err.message || err}\n\n💡 請確保您已啟動 start_server.bat 並在瀏覽器中登入 Google 帳戶！`);
        }
    }

    async function callOpenRouterMultimodalPrompt(openrouterKey, dogDataUrl, clothesDataUrl) {
        const dogBase64 = getBase64FromDataUrl(dogDataUrl);
        const dogMime = getMimeTypeFromDataUrl(dogDataUrl);
        
        const clothesBase64 = getBase64FromDataUrl(clothesDataUrl);
        const clothesMime = getMimeTypeFromDataUrl(clothesDataUrl);
        
        const systemPrompt = "You are an expert AI fashion stylist. Look at the dog in the first image, and the dog raincoat in the second image. Write a highly detailed, professional, photo-realistic prompt for an image generator (like Imagen 3) to generate a photo of this exact dog wearing this exact raincoat in the exact same background. Describe the dog's breed, coat, posture, the raincoat's specific color, design details, fabric folds, and how it naturally fits the dog's body. Output ONLY the English prompt text itself, do not add any markdown, notes, conversational headers, or introduction.";
        
        const models = [
            "meta-llama/llama-3.2-11b-vision-instruct",        // Production ID (extremely stable, costs almost $0, utilizes OpenRouter registration free credit!)
            "meta-llama/llama-3.2-11b-vision-instruct:free",   // Free Llama 3.2 Vision
            "qwen/qwen-2-vl-7b-instruct:free"                  // Free Qwen 2 VL Vision
        ];
        
        let lastError = null;

        for (const model of models) {
            try {
                console.log(`Trying OpenRouter model: ${model}...`);
                const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${openrouterKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://github.com/apetto-fitstudio',
                        'X-Title': 'apetto FitStudio'
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: [
                            {
                                role: "user",
                                content: [
                                    {
                                        type: "text",
                                        text: systemPrompt
                                    },
                                    {
                                        type: "image_url",
                                        image_url: {
                                            url: `data:${dogMime};base64,${dogBase64}`
                                        }
                                    },
                                    {
                                        type: "image_url",
                                        image_url: {
                                            url: `data:${clothesMime};base64,${clothesBase64}`
                                        }
                                    }
                                ]
                            }
                        ],
                        max_tokens: 150
                    })
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.error?.message || `HTTP ${response.status}`);
                }

                const resData = await response.json();
                if (!resData.choices || !resData.choices[0] || !resData.choices[0].message) {
                    throw new Error("OpenRouter 返回了空回應。");
                }
                
                const generatedPrompt = resData.choices[0].message.content.trim();
                return generatedPrompt;
            } catch (err) {
                console.warn('OpenRouter model failed:', err);
                lastError = err;
            }
        }
        throw new Error('All OpenRouter models failed. Last error: ' + (lastError ? lastError.message : 'unknown'));
    }

    function getBase64FromDataUrl(dataUrl) {
        if (!dataUrl) return '';
        return dataUrl.split(',')[1] || '';
    }

    function getMimeTypeFromDataUrl(dataUrl) {
        if (!dataUrl) return 'image/jpeg';
        const match = dataUrl.match(/data:([^;]+);/);
        return match ? match[1] : 'image/jpeg';
    }

    // ==========================================================================
    // 11. Trigger AI Generation — GitHub Bridge
    // ==========================================================================

    btnRealAi.addEventListener('click', async () => {
        if (!dogImage || !clothesTransparentImage) {
            alert('Please select a dog photo and a raincoat first!');
            return;
        }
        // On Netlify, token is server-side — always proceed

        const loadingDesc = document.querySelector('.loading-desc');
        aiLoadingModal.classList.add('active');
        startStatusPolling();

        try {
            loadingDesc.textContent = 'Compressing images...';
            const compressedDog     = await compressImage(dogImage.src,        800, 0.82);
            const compressedClothes = await compressImage(clothesRawImage.src, 600, 0.82);

            const jobId = Date.now().toString();
            loadingDesc.textContent = 'Uploading job to GitHub...';
            await ghUploadJob(jobId, compressedDog, compressedClothes);

            loadingDesc.textContent = 'Waiting for local Worker to pick up the job...';
            const { image: resultImageSrc, sha: resultSha } = await ghPollResult(jobId);

            if (resultImageSrc && resultImageSrc.startsWith('data:image')) {
                loadingDesc.textContent = 'Image ready! Displaying...';
                const newDog = new Image();
                newDog.onload = function() {
                    dogImage = newDog;
                    clothesTransparentImage = null;
                    document.querySelectorAll('.clothes-card').forEach(function(c) { c.classList.remove('active'); });
                    if (btnRealAi) btnRealAi.disabled = true;
                    resizeCanvasToFit();
                    draw();
                    // 生成完成，靜默顯示結果（不跳出 alert）

                };
                newDog.src = resultImageSrc;
                await ghDeleteFile('jobs/done/' + jobId + '.json', resultSha);
            } else {
                throw new Error('Worker returned an invalid image. Please retry.');
            }

        } catch (err) {
            console.error(err);
            alert('AI generation failed: ' + (err.message || err));
        } finally {
            stopStatusPolling();
            aiLoadingModal.classList.remove('active');
            var pb = document.getElementById('loading-progress-bar');
            if (pb) pb.style.width = '0%';
        }
    });
});
