// ==UserScript==
// @name        抖音链接处理
// @namespace   Violentmonkey Scripts
// @match       https://haohuo.jinritemai.com/*
// @grant       none
// @version     1.1
// @author      LCJ
// @icon        https://p-pc-weboff.byteimg.com/tos-cn-i-9r5gewecjs/favicon.png
// @description 抖音商品链接自动重定向，统一添加 origin_type=pc_buyin_group 参数
// @downloadURL https://www.lcjscript.asia/DM.user.js
// @updateURL  https://www.lcjscript.asia/DM.user.js
// ==/UserScript==

(function() {
    'use strict';
    
    const url = new URL(location.href);
    const id = url.searchParams.get('id');
    const isLongLink = /ecommerce\/trade\/detail\/index\.html/.test(location.href);
    const isShortLink = /\d{19}_010&/.test(location.href);
    
    if (url.searchParams.has('origin_type')) {
        console.log('已包含目标参数，无需处理');
        return;
    }
    
    if (isLongLink || isShortLink) {
        if (!id || !/^\d{19}$/.test(id)) {
            console.log('未找到有效的19位ID');
            return;
        }
        url.searchParams.set('id', id);
        url.searchParams.set('origin_type', 'pc_buyin_group');
        location.replace(url.toString());
    } else {
        console.log('当前链接不匹配规则，无需处理');
    }
})();
