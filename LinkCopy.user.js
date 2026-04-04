// ==UserScript==
// @name         链接复制按钮
// @namespace    https://github.com/
// @version      1.0
// @description  鼠标悬浮链接时在右上角显示复制按钮，点击复制不跳转链接，支持指定域名+黑名单屏蔽
// @author       LCJ
// @match        https://*.vip.vip.com/*
// @grant        none
// @run-at       document-idle
// @downloadURL  https://www.lcjscript.asia/LinkCopy.user.js
// @updateURL    https://www.lcjscript.asia/LinkCopy.user.js
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG = {
        btnText: "复制",          
        btnOffsetTop: 2,          
        btnOffsetRight: 2,        
        // 黑名单区域 - 这些区域内的链接不会生成按钮，按需增删
        elementBlacklist: [
            "div.el-scrollbar__view",
            "div.onedp-app-sidebar",
            "div.onedp-app-header-inner"
        ]
    };

    const cssStyle = `
        #linkCopyBtn {
            position: absolute;
            z-index: 9999;
            padding: 2px 5px;
            border: none;
            border-radius: 2px;
            background: #1677ff;
            color: #fff;
            font-size: 11px;
            cursor: pointer;
            user-select: none;
            opacity: 0.85;
            transition: all 0.2s;
            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
            line-height: 1;
            margin: 0;
        }
        #linkCopyBtn:hover {
            opacity: 1;
            background: #0958d9;
            transform: scale(1.03);
        }
        #linkCopyTip {
            position: fixed;
            padding: 5px 10px;
            border-radius: 4px;
            background: rgba(0,0,0,0.85);
            color: #fff;
            font-size: 12px;
            z-index: 99999;
            user-select: none;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s ease;
        }
    `;
    const styleNode = document.createElement('style');
    styleNode.textContent = cssStyle;
    document.head.appendChild(styleNode);

    let copyBtn = null;
    let tipBox = null;
    let currentTarget = null; 

    function init() {
        if (!copyBtn) {
            copyBtn = document.createElement('button');
            copyBtn.id = 'linkCopyBtn';
            copyBtn.textContent = CONFIG.btnText;
            copyBtn.style.display = 'none';
            document.body.appendChild(copyBtn);
            copyBtn.addEventListener('click', handleCopyClick);
        }
        if (!tipBox) {
            tipBox = document.createElement('div');
            tipBox.id = 'linkCopyTip';
            document.body.appendChild(tipBox);
        }
    }

    function isInBlacklist(el) {
        let parent = el;
        while (parent && parent !== document.body) {
            for (const selector of CONFIG.elementBlacklist) {
                if (parent.matches && parent.matches(selector)) return true;
            }
            parent = parent.parentElement;
        }
        return false;
    }

    function isValidHref(el) {
        const href = el.getAttribute('href') || '';
        return !!href && href !== '#' && !href.startsWith('javascript:');
    }

    function showBtn(el) {
        if (isInBlacklist(el) || !isValidHref(el)) {
            copyBtn.style.display = 'none';
            currentTarget = null;
            return;
        }

        currentTarget = el;
        if (window.getComputedStyle(el).position === 'static') {
            el.style.position = 'relative';
        }
        copyBtn.style.top = `${CONFIG.btnOffsetTop}px`;
        copyBtn.style.right = `${CONFIG.btnOffsetRight}px`;
        copyBtn.style.display = 'block';
        el.appendChild(copyBtn);
    }

    function hideBtn() {
        copyBtn.style.display = 'none';
        currentTarget = null;
    }

    function handleCopyClick(e) {
        e.stopPropagation();
        e.preventDefault();

        if (!currentTarget) return;
        const href = currentTarget.getAttribute('href');
        navigator.clipboard.writeText(href).then(() => {
            showTip('✅ 复制成功');
        }).catch(err => {
            showTip('❌ 复制失败', true);
            console.error('复制失败:', err);
        });
    }

    function showTip(text, isError = false) {
        tipBox.textContent = text;
        tipBox.style.opacity = '1';
        tipBox.style.left = `calc(50% - ${tipBox.offsetWidth / 2}px)`;
        tipBox.style.top = `calc(80% - ${tipBox.offsetHeight / 2}px)`;
        clearTimeout(tipBox.timer);
        tipBox.timer = setTimeout(() => {
            tipBox.style.opacity = '0';
        }, isError ? 5000 : 1500);
    }

    init();
    document.addEventListener('mouseenter', function(e) {
        const targetEl = e.target.closest('[href]');
        if (targetEl && targetEl !== currentTarget) {
            showBtn(targetEl);
        }
    }, true);

    document.addEventListener('mouseleave', function(e) {
        const targetEl = e.target.closest('[href]');
        if (targetEl && targetEl === currentTarget) {
            hideBtn();
        }
    }, true);

})();