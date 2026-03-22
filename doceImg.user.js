// ==UserScript==
// @name         文档图片链接预览
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  复制图片链接后，按复制快捷键触发，预览以.png或.jpg结尾的图片
// @author       LCJ
// @match        https://*.corp.vipshop.com/*
// @grant        none
// @downloadURL  https://www.lcjscript.asia/doceImg.user.js
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 创建套娃预览容器（隐藏状态）
    const previewContainer = document.createElement('div');
    previewContainer.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0,0,0,0.9); z-index: 9999; display: none;
        justify-content: center; align-items: center; padding: 20px;
        box-sizing: border-box;
    `;

    // 图片预览元素
    const previewImg = document.createElement('img');
    previewImg.style.cssText = `max-width: 90vw; max-height: 90vh; object-contain`;
    previewImg.alt = '图片预览（点击空白处或按ESC关闭）';

    // 提示信息元素
    const tipMsg = document.createElement('div');
    tipMsg.style.cssText = `
        position: fixed; top: 80px; left: 50%; transform: translateX(-50%);
        color: #fff; font-size: 18px; text-align: center; z-index: 10000;
    `;

    // 组装预览容器
    previewContainer.appendChild(previewImg);
    previewContainer.appendChild(tipMsg);
    document.body.appendChild(previewContainer);

    // 关闭预览的函数
    function closePreview() {
        previewContainer.style.display = 'none';
        tipMsg.textContent = '';
    }

    // 预览图片函数
    async function previewImageFromClipboard() {
        try {
            // 读取剪贴板文本
            const clipboardText = await navigator.clipboard.readText();
            if (!clipboardText) {
                return; // 无内容不做处理
            }

            // 匹配以 .png 或 .jpg 结尾的链接（不区分大小写）
            // 支持 http/https 开头，且后缀可以是 .PNG/.JPG 等大写形式
            const imgRegex = /^(https?:\/\/).+\.(png|jpg)$/i;
            if (!imgRegex.test(clipboardText)) {
                return; // 不是目标格式图片链接，不预览
            }

            // 加载并显示图片
            previewImg.src = clipboardText;
            tipMsg.textContent = '加载中...';
            previewContainer.style.display = 'flex';

            // 图片加载成功
            previewImg.onload = () => {
                tipMsg.textContent = '图片预览（点击空白处或按ESC关闭）';
            };

            // 图片加载失败
            previewImg.onerror = () => {
                tipMsg.textContent = '图片加载失败（点击空白处或按ESC关闭）';
            };

        } catch (err) {
            console.error('剪贴板读取错误：', err);
        }
    }

    // 监听复制快捷键（Ctrl+C / Cmd+C）
    document.addEventListener('keydown', (e) => {
        // 检测 Ctrl+C 或 Cmd+C
        if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
            // 延迟触发（确保复制操作完成后再读取剪贴板）
            setTimeout(previewImageFromClipboard, 300);
        }

        // 按 ESC 关闭预览
        if (e.key === 'Escape' && previewContainer.style.display === 'flex') {
            closePreview();
        }
    });

    // 点击预览区域空白处关闭预览
    previewContainer.addEventListener('click', (e) => {
        if (e.target === previewContainer) {
            closePreview();
        }
    });
})();
