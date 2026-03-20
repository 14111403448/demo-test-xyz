// ==UserScript==
// @name        抖音链接处理
// @namespace   Violentmonkey Scripts
// @match       https://haohuo.jinritemai.com/*
// @grant       none
// @version     1.0
// @author      LCJ
// @icon        https://p-pc-weboff.byteimg.com/tos-cn-i-9r5gewecjs/favicon.png
// @downloadURL http://www.lcjscript.asia/demo-test-xyz/DM.user.js
// ==/UserScript==

(function() {
    'use strict';
    const currentUrl = window.location.href;
    // 长链接标识：包含详情页路径和id参数
    const isLongLink = /ecommerce\/trade\/detail\/index\.html\?id=/.test(currentUrl);
    // 短链接标识：包含原脚本匹配的特征
    const isShortLink = /\d{19}_010&/.test(currentUrl);

    // 1. 处理长链接
    if (isLongLink) {
        // 检查是否已包含目标后缀，有则不处理
        if (currentUrl.includes('&origin_type=pc_buyin_group')) {
            console.log('长链接已包含目标后缀，无需处理');
            return;
        }
        // 提取id后的19位数字
        const idRegex = /id=(\d{19})/;
        const idMatch = currentUrl.match(idRegex);
        if (idMatch && idMatch[1]) {
            const numberStr = idMatch[1];
            // 构建带指定后缀的标准长链接
            const standardUrl = `https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=${numberStr}&origin_type=pc_buyin_group`;
            window.location.href = standardUrl;
        } else {
            console.log('长链接中未找到符合要求的19位id');
        }
    }
    // 2. 处理短链接（沿用原逻辑）
    else if (isShortLink) {
        const regex = /(\d{19})_010&/;
        const match = currentUrl.match(regex);
        if (match && match[1]) {
            const numberStr = match[1];
            const newUrl = `https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=${numberStr}&origin_type=pc_buyin_group`;
            window.location.href = newUrl;
        } else {
            console.log('未找到符合要求的19位数字');
        }
    }
    // 3. 既不是长链也不是短链，不处理
    else {
        console.log('当前链接不匹配短链/长链规则，无需处理');
    }

})();




