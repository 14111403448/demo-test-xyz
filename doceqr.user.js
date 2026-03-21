// ==UserScript==
// @name         文档链接二维码生成器
// @namespace    Violentmonkey Scripts
// @version      1.9
// @description  文档页按Ctrl+C生成二维码，得物链接强制转化+特殊链接不优化，支持天猫国际、京东、拼多多链接优化，二维码图片可拖动+临时消失开关+自定义位置不重置
// @author       LCJ
// @match        https://docs.corp.vipshop.com/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @require      https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js
// @icon         https://img.alicdn.com/imgextra/i3/O1CN01CkZbKp27arsx4ktdK_!!6000000007814-2-tps-96-96.png
// @downloadURL  http://www.lcjscript.asia/doceqr.user.js
// ==/UserScript==
(function() {
    'use strict';

    let isSettingOpen = false;
    let qrContainer = null;
    let zoomedQrContainer = null;
    let currentOriginalUrl = '';
    let mouseX = 0;
    let mouseY = 0;
    let hideTimer = null;
    let showTimer = null;
    let isAltPressed = false;
    let isDraggingModal = false;
    let modalOffsetX = 0;
    let modalOffsetY = 0;

    const BASE_SIZE = 200;
    const JUDGE_RANGE_SCALE = 1.2;
    const HIDE_DELAY = 100;
    const SHOW_DELAY = 300;
    const ZOOMED_SCALE = 0.6;

    // 配置模块
    const ConfigModule = {
        STORAGE_KEYS: {
            BASE_CONFIG: 'qrConfig_v1.9',
            CUSTOM_POS: 'qrCustomPos_v1.9'
        },
        DEFAULT_CONFIG: {
            size: 100,
            position: 'rightBottom',
            linkMode: 'original',
            enableQrImageDrag: false,
            enableHoverHide: false,
            enableQrCode: true,
            enableDoubleClickZoom: false
        },

        getBaseConfig() {
            const saved = GM_getValue(this.STORAGE_KEYS.BASE_CONFIG, this.DEFAULT_CONFIG);
            Object.keys(this.DEFAULT_CONFIG).forEach(key => {
                if (saved[key] === undefined) saved[key] = this.DEFAULT_CONFIG[key];
            });
            return saved;
        },

        saveBaseConfig(config) {
            if (typeof config !== 'object' || config === null) {
                console.error('[文档二维码生成器] 无效的配置数据');
                return;
            }
            
            const sanitizedConfig = {
                size: Math.max(50, Math.min(200, config.size || 100)),
                position: ['leftBottom', 'rightBottom', 'custom'].includes(config.position) ? config.position : 'rightBottom',
                linkMode: ['original', 'optimized'].includes(config.linkMode) ? config.linkMode : 'original',
                enableQrImageDrag: Boolean(config.enableQrImageDrag),
                enableHoverHide: Boolean(config.enableHoverHide),
                enableQrCode: Boolean(config.enableQrCode),
                enableDoubleClickZoom: Boolean(config.enableDoubleClickZoom)
            };
            
            GM_setValue(this.STORAGE_KEYS.BASE_CONFIG, sanitizedConfig);
        },

        getCustomPos() {
            const saved = GM_getValue(this.STORAGE_KEYS.CUSTOM_POS);
            if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
                return saved;
            }
            const size = calculateSize(this.getBaseConfig().size);
            const margin = 25;
            return {
                left: window.innerWidth - (size + margin + 20),
                top: window.innerHeight - (size + margin + 20)
            };
        },

        saveCustomPos(pos) {
            const validPos = {
                left: Math.round(Number(pos.left) || 0),
                top: Math.round(Number(pos.top) || 0)
            };
            GM_setValue(this.STORAGE_KEYS.CUSTOM_POS, validPos);
        }
    };

    // URL处理模块
    const UrlProcessor = {
        DEWU_SOURCE_REG: /https?:\/\/www\.dewu\.com\/product-detail\.html\?/i,
        DEWU_REG_SPU: /spuId=(\d+)&?/i,
        DEWU_REG_SKU: /skuId=(\d+)&?/i,
        DEWU_TARGET_HOST: "cdn-m.dewu.com",
        DEWU_TARGET_PATH: "/router/product/ProductDetail",
        JD_REG: /https?:\/\/(item\.jd\.com|npcitem\.jd\.hk)\/\d+\.html/i,
        PDD_REG: /https?:\/\/mobile\.pinduoduo\.com\/goods\//i,
        NO_OPTIMIZE_PARAMS: [
            { key: "maskchannel", value: "bybtrs" },
            { key: "u_channel", value: "bybtqdyh" }
        ],

        processUrl(originalUrl, linkMode) {
            if (!originalUrl || typeof originalUrl !== 'string') {
                return originalUrl;
            }
            
            let processedUrl = originalUrl.replace(/<script[^>]*>.*?<\/script>/gi, '');

            if (this.DEWU_SOURCE_REG.test(processedUrl)) {
                const spuId = processedUrl.match(this.DEWU_REG_SPU)?.[1];
                const skuId = processedUrl.match(this.DEWU_REG_SKU)?.[1];
                if (spuId && skuId) {
                    const params = new URLSearchParams({
                        sourceName: 'pc',
                        spuId: spuId,
                        skuId: skuId
                    });
                    processedUrl = `https://${this.DEWU_TARGET_HOST}${this.DEWU_TARGET_PATH}?${params.toString()}`;
                }
            }

            // 京东链接优化
            if (this.JD_REG.test(processedUrl)) {
                const match = processedUrl.match(/(\d+)\.html/i);
                if (match && match[1]) {
                    processedUrl = `https://item.m.jd.com/product/${match[1]}.html`;
                }
            }

            // 拼多多链接优化
            if (this.PDD_REG.test(processedUrl)) {
                try {
                    const url = new URL(processedUrl);
                    const goodsId = url.pathname.split('/').pop();
                    if (goodsId) {
                        processedUrl = `https://mobile.yangkeduo.com/goods.html?goods_id=${goodsId}`;
                    }
                } catch (e) {
                    handleError(e, '拼多多链接处理失败');
                }
            }

            if (linkMode !== 'optimized') return processedUrl;

            try {
                const params = new URLSearchParams(processedUrl.split('?')[1] || '');
                const hasNoOptimize = this.NO_OPTIMIZE_PARAMS.some(rule => params.get(rule.key) === rule.value);
                if (hasNoOptimize) return processedUrl;

                const url = new URL(processedUrl);
                const urlParams = new URLSearchParams(url.search);

                if (url.hostname.includes('tmall.com') || url.hostname.includes('taobao.com') || url.hostname.includes('tmall.hk')) {
                    if (url.hostname.includes('tmall.hk')) {
                        url.hostname = 'item.taobao.com';
                        if (url.pathname.startsWith('/hk/')) {
                            url.pathname = url.pathname.replace('/hk/', '/');
                        }
                    }
                    const essential = new URLSearchParams();
                    if (urlParams.has('id')) essential.append('id', urlParams.get('id'));
                    if (urlParams.has('skuId')) essential.append('skuId', urlParams.get('skuId'));
                    url.search = essential.toString();
                    return url.toString();
                }

                const redundant = ['spm', 'mi_id', 'upStreamPrice', 'from', 'rk3s', 'rrcfp', 'x-orig-authkey', 'x-orig-expires', 'trackId', 'traceId'];
                redundant.forEach(key => urlParams.delete(key));
                url.search = urlParams.toString();
                return url.toString();
            } catch (e) {
                handleError(e, '链接优化失败');
                return processedUrl;
            }
        },

        isImageUrl(url) {
            try {
                const parsedUrl = new URL(url);
                const path = parsedUrl.pathname.toLowerCase();
                return path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg');
            } catch (e) {
                const lowerUrl = url.toLowerCase();
                return lowerUrl.endsWith('.png') || lowerUrl.endsWith('.jpg') || lowerUrl.endsWith('.jpeg');
            }
        },

        isValidUrl(text) {
            if (!text || typeof text !== 'string') return false;
            const trimmed = text.trim();
            if (trimmed.length < 5) return false;
            try {
                const url = trimmed.startsWith('www.') ? `https://${trimmed}` : trimmed;
                return new URL(url).protocol.startsWith('http');
            } catch (e) {
                return false;
            }
        }
    };

    GM_addStyle(`
        .vip-qr-container {
            position: fixed;
            z-index: 9999;
            transition: opacity 0.3s ease;
            opacity: 1;
            pointer-events: auto;
        }
        .vip-qr-container.hidden {
            opacity: 0;
            pointer-events: none;
        }
        .vip-qr-judge-box {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            pointer-events: none;
            z-index: -1;
            background: transparent;
        }
        .vip-qr-code {
            background: white;
            padding: 8px;
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            cursor: pointer;
        }
        .vip-qr-close {
            position: absolute;
            top: -10px;
            right: -10px;
            width: 22px;
            height: 22px;
            background: #ccc;
            border-radius: 50%;
            cursor: pointer;
            opacity: 0.8;
            transition: all 0.2s;
            z-index: 2;
        }
        .vip-qr-close:hover {
            opacity: 1;
            background: #ff5252;
        }
        .vip-qr-close:before, .vip-qr-close:after {
            content: '';
            position: absolute;
            top: 10px;
            left: 5px;
            width: 12px;
            height: 2px;
            background: white;
        }
        .vip-qr-close:before { transform: rotate(45deg); }
        .vip-qr-close:after { transform: rotate(-45deg); }
        .vip-qr-gear {
            position: absolute;
            top: -10px;
            left: -10px;
            width: 22px;
            height: 22px;
            background: #ccc;
            border-radius: 50%;
            cursor: pointer;
            opacity: 0.8;
            transition: all 0.2s;
            z-index: 2;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .vip-qr-gear:hover {
            opacity: 1;
            background: #0066cc;
        }
        .vip-qr-gear-icon {
            width: 12px;
            height: 12px;
            background-color: white;
            mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='currentColor' d='M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z'/%3E%3C/svg%3E");
            mask-size: contain;
        }
        .vip-qr-settings-modal {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            z-index: 10000;
            width: 300px;
            cursor: move;
        }
        .vip-qr-settings-modal .vip-qr-settings-group,
        .vip-qr-settings-modal .vip-qr-settings-actions,
        .vip-qr-settings-modal input,
        .vip-qr-settings-modal button {
            cursor: default;
        }
        .vip-qr-settings-title {
            margin: 0 0 15px 0;
            font-size: 16px;
            color: #333;
            text-align: center;
        }
        .vip-qr-settings-group {
            margin-bottom: 15px;
        }
        .vip-qr-settings-label {
            display: block;
            margin-bottom: 8px;
            font-size: 14px;
            color: #666;
        }
        .vip-qr-settings-options {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }
        .vip-qr-settings-option {
            padding: 4px 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s;
        }
        .vip-qr-settings-option.active {
            background: #0066cc;
            color: white;
            border-color: #0066cc;
        }
        .vip-qr-settings-actions {
            display: flex;
            justify-content: center;
            gap: 10px;
            margin-top: 20px;
        }
        .vip-qr-settings-btn {
            padding: 6px 16px;
            border-radius: 4px;
            border: none;
            cursor: pointer;
            font-size: 13px;
        }
        .vip-qr-settings-save {
            background: #0066cc;
            color: white;
        }
        .vip-qr-settings-cancel {
            background: #f5f5f5;
            color: #666;
        }
        .vip-qr-preview {
            position: fixed;
            border: 2px dashed #0066cc;
            background: rgba(0,102,204,0.05);
            z-index: 9998;
            cursor: move;
            transition: width 0.2s, height 0.2s;
        }
        .vip-qr-mask {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.3);
            z-index: 9997;
            pointer-events: auto;
            cursor: pointer;
        }
        .vip-qr-switch {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .vip-qr-switch input {
            width: 40px;
            height: 20px;
            appearance: none;
            border-radius: 10px;
            background: #eee;
            position: relative;
            outline: none;
            cursor: pointer;
            transition: background 0.2s;
        }
        .vip-qr-switch input:checked {
            background: #0066cc;
        }
        .vip-qr-switch input:before {
            content: '';
            position: absolute;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            top: 2px;
            left: 2px;
            background: white;
            transition: left 0.2s;
        }
        .vip-qr-switch input:checked:before {
            left: 22px;
        }
        .vip-qr-switch span {
            font-size: 13px;
            color: #666;
        }
        .vip-qr-zoomed-container {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 10001;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 30px rgba(0,0,0,0.2);
        }
        .vip-qr-only-gear {
            position: fixed;
            z-index: 9999;
            left: 50%;
            bottom: 25px;
            transform: translateX(-50%);
        }
        .vip-qr-code img, .vip-qr-code canvas {
            cursor: grab;
        }
        .vip-qr-code img:active, .vip-qr-code canvas:active {
            cursor: grabbing;
        }
        .vip-qr-error {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #ff4444;
            color: white;
            padding: 10px 20px;
            border-radius: 4px;
            z-index: 10002;
        }
    `);

    // 统一错误处理
    function handleError(error, context) {
        console.error(`[文档二维码生成器] ${context}`, error);
        
        if (context.includes('生成失败')) {
            const errorMsg = document.createElement('div');
            errorMsg.className = 'vip-qr-error';
            errorMsg.textContent = '二维码生成失败，请重试';
            document.body.appendChild(errorMsg);
            
            setTimeout(() => errorMsg.remove(), 3000);
        }
    }

    function calculateSize(percent) {
        return Math.floor(BASE_SIZE * (percent / 100));
    }

    function applyPosition(container) {
        const margin = 25;
        const config = ConfigModule.getBaseConfig();
        const size = calculateSize(config.size);
        container.style.left = 'auto';
        container.style.top = 'auto';
        container.style.right = 'auto';
        container.style.bottom = 'auto';
        container.style.transform = 'translate(0, 0)';

        if (!container.classList.contains('vip-qr-only-gear')) {
            if (config.position === 'leftBottom') {
                container.style.left = `${margin}px`;
                container.style.bottom = `${margin}px`;
            } else if (config.position === 'rightBottom') {
                container.style.right = `${margin}px`;
                container.style.bottom = `${margin}px`;
            } else if (config.position === 'custom') {
                const customPos = ConfigModule.getCustomPos();
                container.style.left = `${customPos.left}px`;
                container.style.top = `${customPos.top}px`;
            }
        }
    }

    // 优化的鼠标位置检查
    function checkMousePosition() {
        // 持续循环检查，确保功能正常工作
        requestAnimationFrame(checkMousePosition);
        
        if (!qrContainer || isSettingOpen) return;
        const config = ConfigModule.getBaseConfig();
        if (!config.enableHoverHide) return;
        
        if (isAltPressed) {
            clearTimeout(hideTimer);
            clearTimeout(showTimer);
            qrContainer.classList.remove('hidden');
            return;
        }
        
        const judgeBox = qrContainer.querySelector('.vip-qr-judge-box');
        const judgeRect = judgeBox.getBoundingClientRect();
        const isInJudgeArea = mouseX >= judgeRect.left && mouseX <= judgeRect.right && 
                             mouseY >= judgeRect.top && mouseY <= judgeRect.bottom;
        
        if (isInJudgeArea) {
            clearTimeout(showTimer);
            hideTimer = setTimeout(() => qrContainer.classList.add('hidden'), HIDE_DELAY);
        } else {
            clearTimeout(hideTimer);
            showTimer = setTimeout(() => qrContainer.classList.remove('hidden'), SHOW_DELAY);
        }
    }

    function clearAllTimers() {
        if (hideTimer) clearTimeout(hideTimer);
        if (showTimer) clearTimeout(showTimer);
        hideTimer = null;
        showTimer = null;
    }

    function setQrDragable(qrElement, enable) {
        const imgElements = qrElement.querySelectorAll('img, canvas');
        imgElements.forEach(el => {
            el.draggable = enable;
            if (enable) {
                el.removeEventListener('dragstart', preventDrag);
            } else {
                el.addEventListener('dragstart', preventDrag);
            }
        });
    }

    function preventDrag(e) {
        e.preventDefault();
    }

    function showOnlyGearButton() {
        if (qrContainer) qrContainer.remove();

        qrContainer = document.createElement('div');
        qrContainer.className = 'vip-qr-container vip-qr-only-gear';
        qrContainer.innerHTML = `
            <div class="vip-qr-gear"><div class="vip-qr-gear-icon"></div></div>
        `;
        document.body.appendChild(qrContainer);

        qrContainer.style.left = '50%';
        qrContainer.style.bottom = '25px';
        qrContainer.style.transform = 'translateX(-50%)';
        qrContainer.style.top = 'auto';
        qrContainer.style.right = 'auto';

        qrContainer.querySelector('.vip-qr-gear').addEventListener('click', () => {
            clearAllTimers();
            createSettingsModal();
        });
    }

    function zoomQrCode(url) {
        if (zoomedQrContainer) zoomedQrContainer.remove();

        const fragment = document.createDocumentFragment();
        
        const mask = document.createElement('div');
        mask.className = 'vip-qr-mask';
        fragment.appendChild(mask);

        const maxSize = Math.min(window.innerWidth, window.innerHeight) * ZOOMED_SCALE;

        zoomedQrContainer = document.createElement('div');
        zoomedQrContainer.className = 'vip-qr-zoomed-container';
        const qrId = `qr-zoomed-${Date.now()}`;
        zoomedQrContainer.innerHTML = `
            <div class="vip-qr-code" id="${qrId}"></div>
        `;
        fragment.appendChild(zoomedQrContainer);
        
        document.body.appendChild(fragment);

        try {
            new QRCode(document.getElementById(qrId), {
                text: url,
                width: maxSize,
                height: maxSize,
                colorDark: '#000',
                colorLight: '#fff',
                correctLevel: QRCode.CorrectLevel.H
            });
            const config = ConfigModule.getBaseConfig();
            setQrDragable(zoomedQrContainer, config.enableQrImageDrag);
        } catch (e) {
            handleError(e, '放大二维码生成失败');
        }

        if (qrContainer && !qrContainer.classList.contains('vip-qr-only-gear')) {
            qrContainer.style.display = 'none';
        }

        const closeZoom = () => {
            zoomedQrContainer.remove();
            mask.remove();
            zoomedQrContainer = null;
            if (qrContainer && !qrContainer.classList.contains('vip-qr-only-gear')) {
                qrContainer.style.display = '';
            }
        };

        mask.addEventListener('click', closeZoom);
        zoomedQrContainer.addEventListener('click', closeZoom);
    }

    function createQRContainer(originalUrl) {
        const config = ConfigModule.getBaseConfig();
        if (!config.enableQrCode) {
            showOnlyGearButton();
            return;
        }

        currentOriginalUrl = originalUrl;
        clearAllTimers();
        if (qrContainer) qrContainer.remove();

        const finalUrl = UrlProcessor.processUrl(originalUrl, config.linkMode);

        qrContainer = document.createElement('div');
        qrContainer.className = 'vip-qr-container';
        const qrId = `qr-code-${Date.now()}`;
        qrContainer.innerHTML = `
            <div class="vip-qr-judge-box"></div>
            <div class="vip-qr-gear"><div class="vip-qr-gear-icon"></div></div>
            <div class="vip-qr-code" id="${qrId}"></div>
            <div class="vip-qr-close"></div>
        `;
        document.body.appendChild(qrContainer);

        try {
            const size = calculateSize(config.size);
            try {
                new QRCode(document.getElementById(qrId), {
                    text: finalUrl,
                    width: size,
                    height: size,
                    colorDark: '#000',
                    colorLight: '#fff',
                    correctLevel: QRCode.CorrectLevel.H
                });
                
                if (config.enableDoubleClickZoom) {
                    qrContainer.querySelector('.vip-qr-code').addEventListener('dblclick', (e) => {
                        e.stopPropagation();
                        zoomQrCode(finalUrl);
                    });
                }
                
                setQrDragable(qrContainer, config.enableQrImageDrag);
            } catch (e) {
                handleError(e, '二维码生成失败');
                qrContainer.querySelector('.vip-qr-code').innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: red;">生成失败</div>';
            }
        } catch (e) {
            handleError(e, '二维码生成初始化失败');
        }

        applyPosition(qrContainer);
        const size = calculateSize(config.size);
        const judgeSize = size * JUDGE_RANGE_SCALE;
        qrContainer.querySelector('.vip-qr-judge-box').style.width = `${judgeSize}px`;
        qrContainer.querySelector('.vip-qr-judge-box').style.height = `${judgeSize}px`;

        checkMousePosition();

        qrContainer.querySelector('.vip-qr-close').addEventListener('click', () => {
            clearAllTimers();
            qrContainer.remove();
            qrContainer = null;
        });

        qrContainer.querySelector('.vip-qr-gear').addEventListener('click', () => {
            clearAllTimers();
            createSettingsModal();
        });

        return qrContainer;
    }

    // 事件委托管理鼠标事件
    function setupGlobalEventListeners() {
        let isDraggingQr = false;
        let qrOffsetX = 0;
        let qrOffsetY = 0;
        let qrElement = null;
        let previewElement = null;
        
        document.addEventListener('mousedown', (e) => {
            // 处理二维码图片/画布拖拽
            const qrCode = e.target.closest('.vip-qr-code');
            const qrContainer = qrCode?.closest('.vip-qr-container');
            if (qrCode && qrContainer) {
                const isImageCanvas = e.target.tagName === 'IMG' || e.target.tagName === 'CANVAS';
                if (isImageCanvas && ConfigModule.getBaseConfig().enableQrImageDrag) {
                    return;
                }
                e.preventDefault();
            }
            
            // 处理模态框拖拽
            const modal = e.target.closest('.vip-qr-settings-modal');
            if (modal) {
                const modalRect = modal.getBoundingClientRect();
                modalOffsetX = e.clientX - modalRect.left;
                modalOffsetY = e.clientY - modalRect.top;
                modal.style.transform = 'none';
                modal.style.left = `${modalRect.left}px`;
                modal.style.top = `${modalRect.top}px`;
                isDraggingModal = true;
                modal.style.cursor = 'grabbing';
            }
            
            // 处理预览框拖拽
            const preview = e.target.closest('.vip-qr-preview');
            if (preview) {
                previewElement = preview;
                const rect = preview.getBoundingClientRect();
                qrOffsetX = e.clientX - rect.left;
                qrOffsetY = e.clientY - rect.top;
                preview.style.cursor = 'grabbing';
            }
        });
        
        document.addEventListener('mousemove', (e) => {
            // 更新鼠标位置
            mouseX = e.clientX;
            mouseY = e.clientY;           
            // 处理模态框拖拽
            if (isDraggingModal && isSettingOpen) {
                const modal = document.querySelector('.vip-qr-settings-modal');
                if (modal) {
                    modal.style.left = `${e.clientX - modalOffsetX}px`;
                    modal.style.top = `${e.clientY - modalOffsetY}px`;
                }
            }
            
            // 处理预览框拖拽
            if (previewElement) {
                const x = e.clientX - qrOffsetX;
                const y = e.clientY - qrOffsetY;
                previewElement.style.left = `${x}px`;
                previewElement.style.top = `${y}px`;
                previewElement.style.right = 'auto';
                previewElement.style.bottom = 'auto';
                ConfigModule.saveCustomPos({ left: x, top: y });
            }
        });
        
        document.addEventListener('mouseup', () => {
            isDraggingQr = false;
            qrElement = null;
            
            if (isDraggingModal) {
                isDraggingModal = false;
                const modal = document.querySelector('.vip-qr-settings-modal');
                if (modal) {
                    modal.style.cursor = 'move';
                }
            }
            
            if (previewElement) {
                previewElement.style.cursor = 'move';
                previewElement = null;
            }
        });
    }

    // 键盘快捷键支持
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Alt + P 快速打开设置
            if (e.altKey && e.key.toLowerCase() === 'p') {
                e.preventDefault();
                if (isSettingOpen) return;
                clearAllTimers();
                createSettingsModal();
            }
            
            // Esc 关闭所有弹窗和二维码
            if (e.key === 'Escape') {
                let closedSomething = false;
                
                if (zoomedQrContainer) {
                    zoomedQrContainer.remove();
                    zoomedQrContainer = null;
                    document.querySelector('.vip-qr-mask')?.remove();
                    // 恢复原二维码容器的显示
                    if (qrContainer && !qrContainer.classList.contains('vip-qr-only-gear')) {
                        qrContainer.style.display = '';
                    }
                    closedSomething = true;
                }
                
                if (!closedSomething && isSettingOpen) {
                    document.querySelector('.vip-qr-settings-modal')?.remove();
                    document.querySelector('.vip-qr-preview')?.remove();
                    document.querySelector('.vip-qr-mask')?.remove();
                    isSettingOpen = false;
                    
                    if (currentOriginalUrl && ConfigModule.getBaseConfig().enableQrCode) {
                        createQRContainer(currentOriginalUrl);
                    } else if (!ConfigModule.getBaseConfig().enableQrCode) {
                        showOnlyGearButton();
                    }
                } else if (!closedSomething && qrContainer) {
                    // 如果不是设置界面，直接关闭二维码容器
                    clearAllTimers();
                    qrContainer.remove();
                    qrContainer = null;
                }
            }
        });
    }

    // 浏览器兼容性检查
    function checkBrowserCompatibility() {
        const requiredAPIs = [
            'URL',
            'URLSearchParams',
            'requestAnimationFrame'
        ];
        
        const missingAPIs = requiredAPIs.filter(api => !window[api]);
        if (missingAPIs.length > 0) {
            console.warn(`[文档二维码生成器] 您的浏览器可能不支持以下API: ${missingAPIs.join(', ')}`);
            
            if (!window.URL) {
                window.URL = function(url) {
                    this.href = url;
                    this.hostname = url.match(/https?:\/\/([^/]+)/)[1];
                    this.pathname = url.match(/https?:\/\/[^/]+(.*)/)[1];
                    this.search = url.match(/\?(.*)/)?.[1] || '';
                };
            }
        }
    }

    function createPreviewBox(sizePercent, position) {
        const preview = document.createElement('div');
        preview.className = 'vip-qr-preview';
        const size = calculateSize(sizePercent);
        const margin = 25;

        preview.style.width = `${size}px`;
        preview.style.height = `${size}px`;
        if (position === 'leftBottom') {
            preview.style.left = `${margin}px`;
            preview.style.bottom = `${margin}px`;
        } else if (position === 'rightBottom') {
            preview.style.right = `${margin}px`;
            preview.style.bottom = `${margin}px`;
        } else if (position === 'custom') {
            const customPos = ConfigModule.getCustomPos();
            preview.style.left = `${customPos.left}px`;
            preview.style.top = `${customPos.top}px`;
        }
        document.body.appendChild(preview);

        return preview;
    }

    function createSettingsModal() {
        isSettingOpen = true;
        clearAllTimers();
        if (qrContainer) { qrContainer.remove(); qrContainer = null; }
        document.querySelector('.vip-qr-settings-modal')?.remove();
        document.querySelector('.vip-qr-preview')?.remove();
        document.querySelector('.vip-qr-mask')?.remove();
        if (zoomedQrContainer) {
            zoomedQrContainer.remove();
            zoomedQrContainer = null;
        }

        const fragment = document.createDocumentFragment();
        
        const mask = document.createElement('div');
        mask.className = 'vip-qr-mask';
        fragment.appendChild(mask);

        const config = ConfigModule.getBaseConfig();
        const modal = document.createElement('div');
        modal.className = 'vip-qr-settings-modal';
        modal.innerHTML = `
            <h3 class="vip-qr-settings-title">二维码设置</h3>
            <div class="vip-qr-settings-group">
                <label class="vip-qr-settings-label">功能总开关</label>
                <div class="vip-qr-switch">
                    <input type="checkbox" id="enableQrCodeSwitch" ${config.enableQrCode ? 'checked' : ''}>
                    <span>二维码生成开关</span>
                </div>
            </div>
            <div class="vip-qr-settings-group">
                <label class="vip-qr-settings-label">大小设置</label>
                <div class="vip-qr-settings-options size-options">
                    <div class="vip-qr-settings-option ${config.size === 100 ? 'active' : ''}" data-size="100">100%</div>
                    <div class="vip-qr-settings-option ${config.size === 80 ? 'active' : ''}" data-size="80">80%</div>
                    <div class="vip-qr-settings-option ${config.size === 60 ? 'active' : ''}" data-size="60">60%</div>
                </div>
            </div>
            <div class="vip-qr-settings-group">
                <label class="vip-qr-settings-label">位置设置</label>
                <div class="vip-qr-settings-options position-options">
                    <div class="vip-qr-settings-option ${config.position === 'leftBottom' ? 'active' : ''}" data-position="leftBottom">左下</div>
                    <div class="vip-qr-settings-option ${config.position === 'rightBottom' ? 'active' : ''}" data-position="rightBottom">右下</div>
                    <div class="vip-qr-settings-option ${config.position === 'custom' ? 'active' : ''}" data-position="custom">自定义</div>
                </div>
            </div>
            <div class="vip-qr-settings-group">
                <label class="vip-qr-settings-label">链接模式</label>
                <div class="vip-qr-settings-options link-mode-options">
                    <div class="vip-qr-settings-option ${config.linkMode === 'optimized' ? 'active' : ''}" data-mode="optimized">优化链接</div>
                    <div class="vip-qr-settings-option ${config.linkMode === 'original' ? 'active' : ''}" data-mode="original">原始链接</div>
                </div>
            </div>
            <div class="vip-qr-settings-group">
                <label class="vip-qr-settings-label">交互功能</label>
                <div class="vip-qr-switch" style="margin-bottom: 8px;">
                    <input type="checkbox" id="enableQrImageDragSwitch" ${config.enableQrImageDrag ? 'checked' : ''}>
                    <span>二维码图片拖拽插入功能</span>
                </div>
                <div class="vip-qr-switch" style="margin-bottom: 8px;">
                    <input type="checkbox" id="enableHoverHideSwitch" ${config.enableHoverHide ? 'checked' : ''}>
                    <span>二维码临时消失开关</span>
                </div>
                <div class="vip-qr-switch">
                    <input type="checkbox" id="enableDoubleClickZoomSwitch" ${config.enableDoubleClickZoom ? 'checked' : ''}>
                    <span>二维码双击放大功能</span>
                </div>
            </div>
            <div class="vip-qr-settings-actions">
                <button class="vip-qr-settings-btn vip-qr-settings-save">保存设置</button>
                <button class="vip-qr-settings-btn vip-qr-settings-cancel">取消</button>
            </div>
        `;
        fragment.appendChild(modal);
        
        document.body.appendChild(fragment);

        let currentSize = config.size;
        let currentPosition = config.position;
        let currentLinkMode = config.linkMode;
        let currentEnableDrag = config.enableQrImageDrag;
        let currentEnableHoverHide = config.enableHoverHide;
        let currentEnableQrCode = config.enableQrCode;
        let currentEnableDoubleClickZoom = config.enableDoubleClickZoom;
        let preview = createPreviewBox(currentSize, currentPosition);

        modal.querySelector('#enableQrCodeSwitch').addEventListener('change', (e) => {
            currentEnableQrCode = e.target.checked;
            if (currentEnableQrCode) {
                preview.style.display = 'block';
            } else {
                preview.style.display = 'none';
            }
        });

        modal.querySelector('#enableQrImageDragSwitch').addEventListener('change', (e) => {
            currentEnableDrag = e.target.checked;
        });

        modal.querySelector('#enableHoverHideSwitch').addEventListener('change', (e) => {
            currentEnableHoverHide = e.target.checked;
            if (currentEnableHoverHide && currentEnableDoubleClickZoom) {
                currentEnableDoubleClickZoom = false;
                modal.querySelector('#enableDoubleClickZoomSwitch').checked = false;
            }
        });

        modal.querySelector('#enableDoubleClickZoomSwitch').addEventListener('change', (e) => {
            currentEnableDoubleClickZoom = e.target.checked;
            if (currentEnableDoubleClickZoom) {
                currentEnableHoverHide = false;
                modal.querySelector('#enableHoverHideSwitch').checked = false;
            }
        });

        modal.querySelectorAll('.size-options .vip-qr-settings-option').forEach(option => {
            option.addEventListener('click', () => {
                modal.querySelectorAll('.size-options .vip-qr-settings-option').forEach(o => o.classList.remove('active'));
                option.classList.add('active');
                currentSize = parseInt(option.getAttribute('data-size'));
                const size = calculateSize(currentSize);
                preview.style.width = `${size}px`;
                preview.style.height = `${size}px`;
            });
        });

        modal.querySelectorAll('.position-options .vip-qr-settings-option').forEach(option => {
            option.addEventListener('click', () => {
                modal.querySelectorAll('.position-options .vip-qr-settings-option').forEach(o => o.classList.remove('active'));
                option.classList.add('active');
                currentPosition = option.getAttribute('data-position');
                preview?.remove();
                preview = createPreviewBox(currentSize, currentPosition);
                if (!currentEnableQrCode) {
                    preview.style.display = 'none';
                }
            });
        });

        modal.querySelectorAll('.link-mode-options .vip-qr-settings-option').forEach(option => {
            option.addEventListener('click', () => {
                modal.querySelectorAll('.link-mode-options .vip-qr-settings-option').forEach(o => o.classList.remove('active'));
                option.classList.add('active');
                currentLinkMode = option.getAttribute('data-mode');
            });
        });

        modal.querySelector('.vip-qr-settings-save').addEventListener('click', () => {
            const newConfig = {
                size: currentSize,
                position: currentPosition,
                linkMode: currentLinkMode,
                enableQrImageDrag: currentEnableDrag,
                enableHoverHide: currentEnableHoverHide,
                enableQrCode: currentEnableQrCode,
                enableDoubleClickZoom: currentEnableDoubleClickZoom
            };
            ConfigModule.saveBaseConfig(newConfig);

            modal.remove();
            preview?.remove();
            mask.remove();
            isSettingOpen = false;

            if (currentOriginalUrl && currentEnableQrCode) {
                createQRContainer(currentOriginalUrl);
            } else if (!currentEnableQrCode) {
                showOnlyGearButton();
            }
        });

        modal.querySelector('.vip-qr-settings-cancel').addEventListener('click', () => {
            modal.remove();
            preview?.remove();
            mask.remove();
            isSettingOpen = false;

            if (currentOriginalUrl && config.enableQrCode) {
                createQRContainer(currentOriginalUrl);
            } else if (!config.enableQrCode) {
                showOnlyGearButton();
            }
        });

        mask.addEventListener('click', () => {
            modal.remove();
            preview?.remove();
            mask.remove();
            isSettingOpen = false;
            if (currentOriginalUrl && config.enableQrCode) {
                createQRContainer(currentOriginalUrl);
            } else if (!config.enableQrCode) {
                showOnlyGearButton();
            }
        });
    }

    // 初始化
    function init() {
        checkBrowserCompatibility();
        setupGlobalEventListeners();
        setupKeyboardShortcuts();

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Alt' || e.key === 'AltLeft' || e.key === 'AltRight') isAltPressed = true;
        });

        document.addEventListener('keyup', (e) => {
            if (e.key === 'Alt' || e.key === 'AltLeft' || e.key === 'AltRight') isAltPressed = false;
        });

        document.addEventListener('keydown', async (e) => {
            if (isSettingOpen) return;
            if (zoomedQrContainer) return; // 二维码处于放大状态时，不触发新二维码生成
            if (e.ctrlKey && e.key === 'c') {
                setTimeout(async () => {
                    try {
                        const text = await navigator.clipboard.readText();
                        if (UrlProcessor.isValidUrl(text)) {
                            if (UrlProcessor.isImageUrl(text)) {
                                console.log('检测到图片链接，不生成二维码');
                                return;
                            }
                            const config = ConfigModule.getBaseConfig();
                            if (config.enableQrCode) {
                                createQRContainer(text);
                            } else {
                                showOnlyGearButton();
                            }
                        }
                    } catch (err) {
                        handleError(err, '剪贴板处理失败');
                    }
                }, 100);
            }
        });
    }

    init();
})();
