// ==UserScript==
// @name         全局链接二维码生成器
// @namespace    http://tampermonkey.net/
// @version      2.3.1
// @description  鼠标悬停带href属性的元素显示二维码，支持得物链接转换、大小/位置/链接模式设置，按+号放大二维码至屏幕60%高度
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @author       LCJ
// @match        https://*.vip.vip.com/*
// @icon         https://cdn-icons.flaticon.com/svg/3917033.svg
// @require      https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js
// @downloadURL  https://www.lcjscript.asia/qrplugin.user.js
// @updateURL    https://www.lcjscript.asia/qrplugin.user.js
// ==/UserScript==

(function() {
    'use strict';

    // 核心配置（默认：1档、右下角、原始链接）
    // 配置拉黑元素，当页面有不需要显示二维码的地方，可以在下面一行代码添加。
    const elementBlacklist = ["div.el-scrollbar__view", "div.onedp-app-sidebar", "div.onedp-app-header-inner"];
    const qrCache = new Map();
    let currentLinkElement = null;
    const offset = 10;
    const BASE_QR_SIZE = 120;
    const DEFAULT_CONFIG = {
        size: 60,    
        position: 'rightBottom',
        linkMode: 'original'
    };
    let isSettingOpen = false;
    let isDraggingModal = false;
    let modalDragOffset = { x: 0, y: 0 };
    let isQRCodeZoomed = false;

    // 创建二维码容器
    const qrContainer = document.createElement('div');
    qrContainer.id = 'global-qr-container';
    qrContainer.style.cssText = `
        position: fixed;
        z-index: 9999;
        background: white;
        padding: 10px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        display: none;
        pointer-events: none;
        transition: opacity 0.15s ease;
    `;
    const qrImg = document.createElement('img');
    qrContainer.appendChild(qrImg);
    document.body.appendChild(qrContainer);

    // 核心样式
    GM_addStyle(`
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
        .vip-qr-settings-title {
            margin: 0 0 15px 0;
            font-size: 16px;
            color: #333;
            text-align: center;
        }
        .vip-qr-settings-group {
            margin-bottom: 15px;
            cursor: default;
        }
        .vip-qr-settings-label {
            display: block;
            margin-bottom: 8px;
            font-size: 14px;
            color: #666;
            cursor: default;
        }
        .vip-qr-settings-options {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            cursor: default;
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
            gap: 10px;
            margin-top: 20px;
            cursor: default;
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
        }
        .vip-qr-toggle {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            margin-bottom: 10px;
        }
        .vip-qr-toggle.disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .vip-qr-toggle-switch {
            position: relative;
            display: inline-block;
            width: 40px;
            height: 20px;
        }
        .vip-qr-toggle-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        .vip-qr-toggle-slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #ccc;
            transition: .4s;
            border-radius: 20px;
        }
        .vip-qr-toggle-slider:before {
            position: absolute;
            content: "";
            height: 16px;
            width: 16px;
            left: 2px;
            bottom: 2px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        }
        .vip-qr-toggle input:checked + .vip-qr-toggle-slider {
            background-color: #0066cc;
        }
        .vip-qr-toggle input:checked + .vip-qr-toggle-slider:before {
            transform: translateX(20px);
        }
        .vip-qr-toggle-label {
            font-size: 13px;
            color: #666;
            flex: 1;
        }
        .vip-qr-link-mode-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
    `);

    // 工具函数
    const isElementBlacklisted = element => elementBlacklist.some(selector => element.closest(selector));

    // 得物链接转换
    const convertDewuLink = url => {
        if (url.includes('www.dewu.com/product-detail.html')) {
            try {
                const parsedUrl = new URL(url);
                const spuId = parsedUrl.searchParams.get('spuId');
                const skuId = parsedUrl.searchParams.get('skuId');
                if (spuId && skuId) return `https://cdn-m.dewu.com/router/product/ProductDetail?sourceName=pc&spuId=${spuId}&skuId=${skuId}`;
            } catch (e) { console.error('得物链接转换失败:', e); }
        }
        return url;
    };

    // 验证URL有效性
    const isValidUrl = url => {
        try { new URL(url); return true; }
        catch (e) {
            if (url.startsWith('//')) return true;
            try { new URL('http://' + url); return true; } catch (e2) { return false; }
        }
    };

    // 清理过期缓存
    const cleanExpiredCache = () => {
        const now = Date.now();
        qrCache.forEach(({ timestamp }, key) => now - timestamp > 30 * 60 * 1000 && qrCache.delete(key));
    };

    // 计算二维码实际尺寸
    const getQrActualSize = () => {
        const sizeRatio = { 60: 1.0, 80: 1.2, 100: 1.44 }[getConfig().size];
        return Math.floor(BASE_QR_SIZE * sizeRatio);
    };

    // 优化链接
    const optimizeUrl = originalUrl => {
        try {
            const url = new URL(originalUrl);
            const params = new URLSearchParams(url.search);

            if (url.hostname.includes('tmall.com') || url.hostname.includes('taobao.com')) {
                const essentialParams = new URLSearchParams();
                params.has('id') && essentialParams.append('id', params.get('id'));
                params.has('skuId') && essentialParams.append('skuId', params.get('skuId'));
                url.search = essentialParams.toString();
                return url.toString();
            }

            ['spm', 'mi_id', 'upStreamPrice', 'from', 'rk3s', 'rrcfp', 'x-orig-authkey', 'x-orig-expires'].forEach(key => params.delete(key));
            url.search = params.toString();
            return url.toString();
        } catch (e) {
            console.warn('链接优化失败，使用原始链接:', e);
            return originalUrl;
        }
    };

    const convertToDeepLink = (originalUrl) => {
        try {
            // 1. 淘宝/天猫 严格转换规则
            if (originalUrl.includes("taobao.com/item.htm") || originalUrl.includes("tmall.com/item.htm")) {
                return originalUrl.replace("https://", "taobao://");
            }

            // 2. 京东 严格转换规则
            if (originalUrl.includes("item.jd.com/")) {
                const idMatch = originalUrl.match(/item\.jd\.com\/(\d+)\.html/);
                if (idMatch && idMatch[1]) {
                    const goodsId = idMatch[1];
                    return `openApp.jdMobile://virtual?params=%7B%22category%22:%22jump%22,%22des%22:%22productDetail%22,%22skuId%22:%22${goodsId}%22%7D`;
                }
            }

            // 3. 其他链接不处理
            return originalUrl;
        } catch (e) {
            console.warn("深度链接转换失败", e);
            return originalUrl;
        }
    };

    // 获取/保存配置
    const getConfig = () => GM_getValue('qrConfig', DEFAULT_CONFIG);
    const saveConfig = config => GM_setValue('qrConfig', config);

    // 计算二维码容器位置
    const calculatePosition = targetElement => {
        const config = getConfig();
        const customPos = GM_getValue('qrCustomPos');
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const margin = 25;
        const qrContainerSize = getQrActualSize() + 20;

        if (config.position === 'elementNear') {
            const rect = targetElement.getBoundingClientRect();
            let left = rect.left + (rect.width - qrContainerSize) / 2;
            let top = rect.bottom + offset;

            if (top + qrContainerSize > viewportHeight) top = rect.top - qrContainerSize - offset;
            if (top < 0) {
                left = rect.right + offset;
                top = rect.top + (rect.height - qrContainerSize) / 2;
            }
            if (left + qrContainerSize > viewportWidth) {
                left = rect.left - qrContainerSize - offset;
                top = rect.top + (rect.height - qrContainerSize) / 2;
            }

            left = left < offset ? offset : left;
            top = top < offset ? offset : top;
            left = left + qrContainerSize > viewportWidth ? viewportWidth - qrContainerSize - offset : left;
            top = top + qrContainerSize > viewportHeight ? viewportHeight - qrContainerSize - margin : top;

            return { left, top };
        }

        if (config.position === 'leftBottom') {
            return { left: margin, top: viewportHeight - qrContainerSize - margin };
        }

        if (config.position === 'rightBottom') {
            return { left: viewportWidth - qrContainerSize - margin, top: viewportHeight - qrContainerSize - margin };
        }

        if (config.position === 'custom' && customPos) {
            let left = customPos.left;
            let top = customPos.top;
            left = left < 0 ? 0 : left;
            top = top < 0 ? 0 : top;
            left = left + qrContainerSize > viewportWidth ? viewportWidth - qrContainerSize : left;
            top = top + qrContainerSize > viewportHeight ? viewportHeight - qrContainerSize : top;
            return { left, top };
        }

        return calculatePosition(targetElement);
    };

    // 显示二维码
    const showQRCodeForElement = element => {
        if (isElementBlacklisted(element)) {
            hideQRCode();
            return;
        }

        let href = element.href;
        if (!href || !isValidUrl(href)) {
            hideQRCode();
            return;
        }

        href = convertDewuLink(href);
        const config = getConfig();

        // 根据链接模式处理
        if (config.linkMode === 'optimized') {
            href = optimizeUrl(href);
        } else if (config.linkMode === 'deep') {
            href = convertToDeepLink(href);
        }

        const qrActualSize = getQrActualSize();
        const cacheKey = `${href}_${qrActualSize}`;
        const cached = qrCache.get(cacheKey);

        if (cached) {
            qrImg.src = cached.dataUrl;
            qrImg.style.width = `${qrActualSize}px`;
            qrImg.style.height = `${qrActualSize}px`;
            qrCache.set(cacheKey, { ...cached, timestamp: Date.now() });
            positionAndShowQRCode(element);
            return;
        }

        QRCode.toDataURL(href, { width: qrActualSize, margin: 1 })
            .then(dataUrl => {
                qrImg.src = dataUrl;
                qrImg.style.width = `${qrActualSize}px`;
                qrImg.style.height = `${qrActualSize}px`;
                qrCache.set(cacheKey, { dataUrl, timestamp: Date.now(), size: qrActualSize });
                positionAndShowQRCode(element);
                cleanExpiredCache();
            })
            .catch(error => {
                console.error('二维码生成失败:', error);
                hideQRCode();
            });
    };

    // 定位并显示二维码
    const positionAndShowQRCode = element => {
        const { left, top } = calculatePosition(element);
        qrContainer.style.left = `${left}px`;
        qrContainer.style.top = `${top}px`;
        qrContainer.style.display = 'block';
    };

    // 隐藏二维码
    const hideQRCode = () => {
        qrContainer.style.display = 'none';
        qrImg.src = '';
        currentLinkElement = null;
    };

    // 放大二维码
    const zoomQRCode = () => {
        if (!qrImg.src || qrContainer.style.display === 'none' || isQRCodeZoomed) return;

        // 创建遮罩层
        const mask = document.createElement('div');
        mask.className = 'vip-qr-mask';
        document.body.appendChild(mask);

        // 核心修改：设置二维码高度为屏幕高度的60%，宽度同高保持正方形
        const screenHeight = window.innerHeight;
        const zoomedHeight = Math.floor(screenHeight * 0.6); 
        const zoomedWidth = zoomedHeight; 

        // 创建放大的二维码容器
        const zoomedContainer = document.createElement('div');
        zoomedContainer.id = 'zoomed-qr-container';
        zoomedContainer.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 9998;
            background: white;
            padding: 20px;
            border-radius: 12px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.3);
            pointer-events: auto;
            max-height: 90vh; // 防止高度超出屏幕
            overflow: hidden;
        `;

        // 创建放大的二维码图片
        const zoomedImg = document.createElement('img');
        zoomedImg.src = qrImg.src;
        zoomedImg.style.width = `${zoomedWidth}px`;
        zoomedImg.style.height = `${zoomedHeight}px`;
        zoomedImg.style.objectFit = 'contain';

        zoomedContainer.appendChild(zoomedImg);
        document.body.appendChild(zoomedContainer);

        isQRCodeZoomed = true;

        // 点击遮罩层关闭放大
        const closeZoom = () => {
            zoomedContainer.remove();
            mask.remove();
            isQRCodeZoomed = false;
            window.removeEventListener('keydown', closeOnEsc);
        };

        mask.addEventListener('click', closeZoom);

        // 按ESC键关闭放大
        const closeOnEsc = (e) => {
            if (e.key === 'Escape' && isQRCodeZoomed) {
                closeZoom();
            }
        };
        window.addEventListener('keydown', closeOnEsc);
    };

    // 创建预览框
    const createPreviewBox = (sizeLevel, position) => {
        const preview = document.createElement('div');
        preview.className = 'vip-qr-preview';
        const sizeRatio = { 60: 1.0, 80: 1.2, 100: 1.44 }[sizeLevel];
        const size = Math.floor(BASE_QR_SIZE * sizeRatio);
        const margin = 25;

        preview.style.width = `${size}px`;
        preview.style.height = `${size}px`;

        if (position === 'elementNear') {
            preview.style.left = `${(window.innerWidth - size) / 2}px`;
            preview.style.top = `${(window.innerHeight - size) / 2}px`;
        } else if (position === 'leftBottom') {
            preview.style.left = `${margin}px`;
            preview.style.bottom = `${margin}px`;
        } else if (position === 'rightBottom') {
            preview.style.right = `${margin}px`;
            preview.style.bottom = `${margin}px`;
        } else {
            const savedPos = GM_getValue('qrCustomPos');
            if (savedPos) {
                preview.style.left = `${savedPos.left}px`;
                preview.style.top = `${savedPos.top}px`;
            } else {
                preview.style.right = '25px';
                preview.style.bottom = '25px';
            }
        }

        document.body.appendChild(preview);

        if (position === 'custom') {
            let isDragging = false;
            let offsetX, offsetY;
            preview.addEventListener('mousedown', (e) => {
                isDragging = true;
                offsetX = e.clientX - preview.getBoundingClientRect().left;
                offsetY = e.clientY - preview.getBoundingClientRect().top;
                preview.style.cursor = 'grabbing';
                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                const x = e.clientX - offsetX;
                const y = e.clientY - offsetY;
                preview.style.left = `${x}px`;
                preview.style.top = `${y}px`;
                preview.style.right = 'auto';
                preview.style.bottom = 'auto';
            });

            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    preview.style.cursor = 'move';
                }
            });
        }

        return preview;
    };

    // 创建设置界面
    const createSettingsModal = () => {
        isSettingOpen = true;
        document.querySelector('.vip-qr-settings-modal')?.remove();
        document.querySelector('.vip-qr-preview')?.remove();
        document.querySelector('.vip-qr-mask')?.remove();

        const mask = document.createElement('div');
        mask.className = 'vip-qr-mask';
        document.body.appendChild(mask);

        const config = getConfig();
        const modal = document.createElement('div');
        modal.className = 'vip-qr-settings-modal';
        modal.innerHTML = `
            <h3 class="vip-qr-settings-title">二维码设置</h3>
            <div class="vip-qr-settings-group">
                <label class="vip-qr-settings-label">大小设置</label>
                <div class="vip-qr-settings-options size-options">
                    <div class="vip-qr-settings-option ${config.size === 60 ? 'active' : ''}" data-size="60">1档</div>
                    <div class="vip-qr-settings-option ${config.size === 80 ? 'active' : ''}" data-size="80">2档</div>
                    <div class="vip-qr-settings-option ${config.size === 100 ? 'active' : ''}" data-size="100">3档</div>
                </div>
            </div>
            <div class="vip-qr-settings-group">
                <label class="vip-qr-settings-label">位置设置</label>
                <div class="vip-qr-settings-options position-options">
                    <div class="vip-qr-settings-option ${config.position === 'elementNear' ? 'active' : ''}" data-position="elementNear">链接附近</div>
                    <div class="vip-qr-settings-option ${config.position === 'leftBottom' ? 'active' : ''}" data-position="leftBottom">左下角</div>
                    <div class="vip-qr-settings-option ${config.position === 'rightBottom' ? 'active' : ''}" data-position="rightBottom">右下角</div>
                    <div class="vip-qr-settings-option ${config.position === 'custom' ? 'active' : ''}" data-position="custom">自定义</div>
                </div>
            </div>
            <div class="vip-qr-settings-group">
                <label class="vip-qr-settings-label">链接模式</label>
                <div class="vip-qr-link-mode-group">
                    <div class="vip-qr-toggle">
                        <span class="vip-qr-toggle-label">原始链接</span>
                        <label class="vip-qr-toggle-switch">
                            <input type="checkbox" class="link-mode-switch" data-mode="original" ${config.linkMode === 'original' ? 'checked' : ''}>
                            <span class="vip-qr-toggle-slider"></span>
                        </label>
                    </div>
                    <div class="vip-qr-toggle">
                        <span class="vip-qr-toggle-label">优化链接</span>
                        <label class="vip-qr-toggle-switch">
                            <input type="checkbox" class="link-mode-switch" data-mode="optimized" ${config.linkMode === 'optimized' ? 'checked' : ''}>
                            <span class="vip-qr-toggle-slider"></span>
                        </label>
                    </div>
                    <div class="vip-qr-toggle">
                        <span class="vip-qr-toggle-label">深度链接</span>
                        <label class="vip-qr-toggle-switch">
                            <input type="checkbox" class="link-mode-switch" data-mode="deep" ${config.linkMode === 'deep' ? 'checked' : ''}>
                            <span class="vip-qr-toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
            <div class="vip-qr-settings-actions">
                <button class="vip-qr-settings-btn vip-qr-settings-save">保存设置</button>
                <button class="vip-qr-settings-btn vip-qr-settings-cancel">取消</button>
            </div>
        `;
        document.body.appendChild(modal);

        let preview = createPreviewBox(config.size, config.position);

        let currentSize = config.size;
        let currentPosition = config.position;
        let currentLinkMode = config.linkMode;

        // 大小选项逻辑
        modal.querySelectorAll('.size-options .vip-qr-settings-option').forEach(option => {
            option.addEventListener('click', () => {
                modal.querySelectorAll('.size-options .vip-qr-settings-option').forEach(o => o.classList.remove('active'));
                option.classList.add('active');
                currentSize = parseInt(option.getAttribute('data-size'));
                preview?.remove();
                preview = createPreviewBox(currentSize, currentPosition);
            });
        });

        // 位置选项逻辑
        modal.querySelectorAll('.position-options .vip-qr-settings-option').forEach(option => {
            option.addEventListener('click', () => {
                modal.querySelectorAll('.position-options .vip-qr-settings-option').forEach(o => o.classList.remove('active'));
                option.classList.add('active');
                currentPosition = option.getAttribute('data-position');
                preview?.remove();
                preview = createPreviewBox(currentSize, currentPosition);
            });
        });

        // 链接模式开关逻辑
        const linkModeSwitches = modal.querySelectorAll('.link-mode-switch');
        linkModeSwitches.forEach(switchEl => {
            switchEl.addEventListener('change', (e) => {
                if (e.target.checked) {                   
                    linkModeSwitches.forEach(el => {
                        if (el !== e.target) {
                            el.checked = false;
                        }
                    });
                    currentLinkMode = e.target.getAttribute('data-mode');
                } else {
                    e.target.checked = true;
                }
            });
        });

        // 保存按钮逻辑
        modal.querySelector('.vip-qr-settings-save').addEventListener('click', () => {
            const newConfig = {
                size: currentSize,
                position: currentPosition,
                linkMode: currentLinkMode
            };

            if (newConfig.position === 'custom' && preview) {
                const rect = preview.getBoundingClientRect();
                GM_setValue('qrCustomPos', { left: rect.left, top: rect.top });
            }

            saveConfig(newConfig);
            if (currentLinkElement && qrContainer.style.display === 'block') {
                showQRCodeForElement(currentLinkElement);
            }

            modal.remove();
            preview?.remove();
            mask.remove();
            isSettingOpen = false;
            console.log('二维码设置已保存');
        });

        // 取消按钮逻辑
        modal.querySelector('.vip-qr-settings-cancel').addEventListener('click', () => {
            modal.remove();
            preview?.remove();
            mask.remove();
            isSettingOpen = false;
        });
    };

    // 设置弹窗拖拽逻辑
    document.addEventListener('mousedown', (e) => {
        const modal = e.target.closest('.vip-qr-settings-modal');
        if (modal) {
            isDraggingModal = true;
            const rect = modal.getBoundingClientRect();
            modalDragOffset.x = e.clientX - rect.left;
            modalDragOffset.y = e.clientY - rect.top;
            // 移除 transform 居中，改为绝对定位以支持拖拽
            modal.style.transform = 'none';
            modal.style.left = `${rect.left}px`;
            modal.style.top = `${rect.top}px`;
            modal.style.cursor = 'grabbing';
            e.preventDefault();
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (isDraggingModal) {
            const modal = document.querySelector('.vip-qr-settings-modal');
            if (modal) {
                modal.style.left = `${e.clientX - modalDragOffset.x}px`;
                modal.style.top = `${e.clientY - modalDragOffset.y}px`;
            }
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDraggingModal) {
            isDraggingModal = false;
            const modal = document.querySelector('.vip-qr-settings-modal');
            if (modal) {
                modal.style.cursor = 'move';
            }
        }
    });

    // 事件监听
    document.addEventListener('mouseenter', (event) => {
        const targetElement = event.target.closest('[href]');
        if (!targetElement || currentLinkElement === targetElement) return;
        currentLinkElement = targetElement;
        showQRCodeForElement(targetElement);
    }, true);

    document.addEventListener('mouseleave', (event) => {
        const targetElement = event.target.closest('[href]');
        if (targetElement && currentLinkElement === targetElement && !targetElement.contains(event.relatedTarget)) {
            hideQRCode();
        }
    }, true);

    window.addEventListener('resize', () => {
        if (currentLinkElement && qrContainer.style.display === 'block') {
            const { left, top } = calculatePosition(currentLinkElement);
            qrContainer.style.left = `${left}px`;
            qrContainer.style.top = `${top}px`;
        }
    });

    // 设置快捷键
    window.addEventListener('keydown', (event) => {
        if (event.altKey && event.key === 'p') {
            event.preventDefault();
            if (isSettingOpen) return;
            createSettingsModal();
        }

        if (event.key === 'Escape' && isSettingOpen) {
            event.preventDefault();
            document.querySelector('.vip-qr-settings-modal')?.remove();
            document.querySelector('.vip-qr-preview')?.remove();
            document.querySelector('.vip-qr-mask')?.remove();
            isSettingOpen = false;
            isDraggingModal = false;
        }

        // 按+号键放大二维码
        if ((event.key === '+' || (event.key === '=' && event.shiftKey)) && !isSettingOpen) {
            event.preventDefault();
            zoomQRCode();
        }
    });

    // 定时清理缓存
    setInterval(cleanExpiredCache, 10 * 60 * 1000);

    console.log('全局链接二维码脚本 v2.3 初始化完成：按Alt+P打开设置，生成二维码后按+号放大至屏幕60%高度');
})();
