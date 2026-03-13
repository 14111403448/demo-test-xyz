// ==UserScript==
// @name         外网平台补贴信息填充
// @author       LCJ
// @match        https://*.pos-admin.vip.vip.com/*
// @grant        none
// @version      1.1
// @description  补贴信息自动填充（修复版）
// @downloadURL  https://c1411403448-rgb.github.io/DM/subsidy-auto-fill.user.js
// ==/UserScript==

(function() {
    'use strict';

    // ====================== 【用户可自定义区域】 ======================
    const DEFAULT_CONFIG = {
        presetItems: [
            { key: "促销或券类型 官方立减XX元/%", type: "促销或券类型", ratio: "0.5", desc: "官方立减XX元/%" },
            { key: "促销或券类型 超级立减XX元/%", type: "促销或券类型", ratio: "0.5", desc: "超级立减XX元/%" },
            { key: "促销或券类型 立减优惠XX元/%", type: "促销或券类型", ratio: "0.5", desc: "立减优惠XX元/%" },
            { key: "百亿补贴/单品补贴 补贴x元", type: "百亿补贴/单品补贴", ratio: "1.0", desc: "补贴x元" }
        ]
    };
    const CUSTOM_DAY_CACHE_KEY = 'promotionFillCustomDay';
    // =================================================================

    let appConfig = { ...DEFAULT_CONFIG };

    // 1. 缓存操作（增强容错）
    function loadConfig() {
        try {
            const saved = localStorage.getItem('promotionFillConfig');
            if (saved) {
                const parsed = JSON.parse(saved);
                // 验证配置结构合法性
                if (parsed && Array.isArray(parsed.presetItems)) {
                    appConfig = { ...DEFAULT_CONFIG, ...parsed };
                } else {
                    console.warn('缓存配置结构异常，使用默认配置');
                }
            }
        } catch (e) {
            console.warn('加载缓存失败，使用默认配置', e);
            appConfig = { ...DEFAULT_CONFIG };
        }
    }

    function saveConfig() {
        try {
            localStorage.setItem('promotionFillConfig', JSON.stringify(appConfig));
        } catch (e) {
            console.error('保存配置失败', e);
            alert('配置保存失败，请检查浏览器存储权限！');
        }
    }

    // 自定义天数缓存操作（增强容错）
    function getSavedCustomDay() {
        try {
            const saved = localStorage.getItem(CUSTOM_DAY_CACHE_KEY);
            const num = parseInt(saved);
            return !isNaN(num) && num >= 1 ? num : '';
        } catch (e) {
            return '';
        }
    }

    function saveCustomDay(days) {
        try {
            const num = parseInt(days);
            if (!isNaN(num) && num >= 1) {
                localStorage.setItem(CUSTOM_DAY_CACHE_KEY, num.toString());
            }
        } catch (e) {
            console.error('保存自定义天数失败', e);
        }
    }

    // 2. 工具函数：等待元素出现（增加重试机制）
    function waitForSelector(selector, timeout = 8000, interval = 100) {
        return new Promise((resolve, reject) => {
            let elapsed = 0;
            const timer = setInterval(() => {
                const el = document.querySelector(selector);
                if (el) {
                    clearInterval(timer);
                    resolve(el);
                }
                elapsed += interval;
                if (elapsed >= timeout) {
                    clearInterval(timer);
                    reject(new Error(`元素【${selector}】超时未找到`));
                }
            }, interval);
        });
    }

    // 补零工具函数（修复日期格式问题）
    function padZero(num) {
        return num.toString().padStart(2, '0');
    }

    // 获取当前日期（标准化格式 YYYY-MM-DD）
    function getCurrentDate() {
        const now = new Date();
        const year = now.getFullYear();
        const month = padZero(now.getMonth() + 1);
        const day = padZero(now.getDate());
        return `${year}-${month}-${day}`;
    }

    // 获取N天后的日期（修复跨月/跨年计算）
    function getDateAfterDays(days) {
        const now = new Date();
        now.setDate(now.getDate() + days);
        const year = now.getFullYear();
        const month = padZero(now.getMonth() + 1);
        const day = padZero(now.getDate());
        return `${year}-${month}-${day}`;
    }

    // 填充日期（增强事件触发）
    async function fillDate(startDate, endDate) {
        try {
            // 兼容不同的日期选择器结构
            const startDateInput = await waitForSelector('input.el-range-input:nth-child(2), .el-date-editor input:first-child');
            const endDateInput = await waitForSelector('input.el-range-input:nth-child(4), .el-date-editor input:last-child');

            // 聚焦-赋值-触发事件（完整的事件链）
            const triggerInputEvents = (el, value) => {
                el.focus();
                el.value = value;
                el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                el.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
                el.dispatchEvent(new Event('compositionend', { bubbles: true, cancelable: true }));
                el.blur();
            };

            triggerInputEvents(startDateInput, startDate);
            triggerInputEvents(endDateInput, endDate);

        } catch (e) {
            console.error('日期填充失败', e);
            alert(`日期填充失败：${e.message}`);
        }
    }

    // 3. 创建核心功能区（优化样式和交互）
    function createFunctionBar() {
        // 功能区容器
        const barContainer = document.createElement('div');
        barContainer.id = 'promotion-fill-bar';
        barContainer.style.cssText = `
            display: flex;align-items: center;gap: 10px;margin-bottom: 10px;padding: 10px;
            background: #f8f9fa;border-radius: 6px;border: 1px solid #e9ecef;
            width: 100%;box-sizing: border-box;flex-wrap: wrap;
            position: relative;z-index: 999;
        `;

        // 左侧话术功能区容器
        const leftFuncWrapper = document.createElement('div');
        leftFuncWrapper.style.cssText = `
            display: flex;align-items: center;gap: 10px;flex: 1;min-width: 280px;
        `;

        // 3.1 下拉话术选择框
        const selectWrapper = document.createElement('div');
        selectWrapper.style.cssText = `
            position: relative;max-width: 260px;width: 100%;
        `;

        // 搜索输入框
        const searchInput = document.createElement('input');
        searchInput.placeholder = '输入关键词搜索';
        searchInput.style.cssText = `
            width: 100%;padding: 8px 12px;border: 1px solid #e9ecef;
            border-radius: 4px;outline: none;font-size: 14px;box-sizing: border-box;
        `;

        // 下拉选项面板（优化层级和滚动）
        const dropdownPanel = document.createElement('div');
        dropdownPanel.style.cssText = `
            position: absolute;top: calc(100% + 5px);left: 0;right: 0;max-height: 200px;overflow-y: auto;
            background: #fff;border: 1px solid #e9ecef;border-radius: 4px;box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            z-index: 9999;display: none;width: 100%;box-sizing: border-box;
            scrollbar-width: thin;
        `;
        // 修复webkit滚动条样式
        dropdownPanel.style.cssText += `
            ::-webkit-scrollbar {width: 6px;}
            ::-webkit-scrollbar-track {background: #f1f1f1;}
            ::-webkit-scrollbar-thumb {background: #ddd;border-radius: 3px;}
            ::-webkit-scrollbar-thumb:hover {background: #ccc;}
        `;

        // 3.2 清空按钮
        const clearBtn = document.createElement('button');
        clearBtn.textContent = '清空';
        clearBtn.style.cssText = `
            padding: 8px 12px;border: 1px solid #e5e6eb;border-radius: 6px;
            background: #f5f5f5;cursor: pointer;font-size: 14px;transition: background-color 0.2s;
            white-space: nowrap;
        `;
        clearBtn.addEventListener('mouseover', () => clearBtn.style.background = '#e8e8e8');
        clearBtn.addEventListener('mouseout', () => clearBtn.style.background = '#f5f5f5');

        // 3.3 设置按钮
        const settingBtn = document.createElement('button');
        settingBtn.textContent = '设置';
        settingBtn.style.cssText = `
            padding: 8px 12px;border: none;border-radius: 6px;
            background: #52c41a;color: #fff;cursor: pointer;font-size: 14px;transition: opacity 0.2s;
            white-space: nowrap;
        `;
        settingBtn.addEventListener('mouseover', () => settingBtn.style.opacity = '1');
        settingBtn.addEventListener('mouseout', () => settingBtn.style.opacity = '0.95');

        // --------------------------
        // 日期快捷按钮区域（响应式优化）
        // --------------------------
        const dateBtnWrapper = document.createElement('div');
        dateBtnWrapper.style.cssText = `
            display: flex;align-items: center;gap: 8px;margin-left: auto;flex-wrap: wrap;
        `;

        // 通用按钮样式
        const btnStyle = `
            padding: 8px 16px;border: none;border-radius: 6px;
            background: #4096ff;color: #fff;cursor: pointer;font-size: 14px;
            transition: background-color 0.2s;white-space: nowrap;
        `;
        const btnHoverStyle = '#3385ff';

        // 日期按钮通用创建函数
        const createDateBtn = (text, days) => {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.style.cssText = btnStyle;
            btn.addEventListener('mouseover', () => btn.style.background = btnHoverStyle);
            btn.addEventListener('mouseout', () => btn.style.background = '#4096ff');
            btn.addEventListener('click', () => {
                const today = getCurrentDate();
                const endDate = getDateAfterDays(days);
                fillDate(today, endDate);
            });
            return btn;
        };

        // 日期按钮
        dateBtnWrapper.appendChild(createDateBtn('1天', 1));
        dateBtnWrapper.appendChild(createDateBtn('3天', 3));
        dateBtnWrapper.appendChild(createDateBtn('7天', 7));
        dateBtnWrapper.appendChild(createDateBtn('15天', 15));

        // 自定义天数输入框
        const customDayInput = document.createElement('input');
        customDayInput.style.cssText = `
            width: 60px;padding: 8px 12px;border: 1px solid #e9ecef;
            border-radius: 6px;outline: none;font-size: 14px;box-sizing: border-box;
            text-align: center;-moz-appearance: textfield;
        `;
        // 隐藏webkit数字调整按钮
        const inputStyle = document.createElement('style');
        inputStyle.textContent = `
            #promotion-fill-bar input::-webkit-outer-spin-button,
            #promotion-fill-bar input::-webkit-inner-spin-button {
                -webkit-appearance: none;margin: 0;
            }
        `;
        document.head.appendChild(inputStyle);

        customDayInput.placeholder = '天数';
        customDayInput.type = 'number';
        customDayInput.min = 1;
        const savedDay = getSavedCustomDay();
        if (savedDay) {
            customDayInput.value = savedDay;
        }

        // 回车触发填充
        customDayInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const days = parseInt(customDayInput.value.trim());
                if (isNaN(days) || days < 1) {
                    alert('请输入有效的天数（≥1）');
                    customDayInput.focus();
                    return;
                }
                const today = getCurrentDate();
                const endDate = getDateAfterDays(days);
                fillDate(today, endDate);
                saveCustomDay(days);
            }
        });

        // 自定义天按钮
        const customDayBtn = document.createElement('button');
        customDayBtn.textContent = '天';
        customDayBtn.style.cssText = btnStyle;
        customDayBtn.addEventListener('mouseover', () => customDayBtn.style.background = btnHoverStyle);
        customDayBtn.addEventListener('mouseout', () => customDayBtn.style.background = '#4096ff');
        customDayBtn.addEventListener('click', () => {
            const days = parseInt(customDayInput.value.trim());
            if (isNaN(days) || days < 1) {
                alert('请输入有效的天数（≥1）');
                customDayInput.focus();
                return;
            }
            const today = getCurrentDate();
            const endDate = getDateAfterDays(days);
            fillDate(today, endDate);
            saveCustomDay(days);
        });

        dateBtnWrapper.appendChild(customDayInput);
        dateBtnWrapper.appendChild(customDayBtn);

        // 组装左侧话术功能区
        selectWrapper.appendChild(searchInput);
        selectWrapper.appendChild(dropdownPanel);
        leftFuncWrapper.appendChild(selectWrapper);
        leftFuncWrapper.appendChild(clearBtn);
        leftFuncWrapper.appendChild(settingBtn);

        // 组装总功能区
        barContainer.appendChild(leftFuncWrapper);
        barContainer.appendChild(dateBtnWrapper);

        // --------------------------
        // 基础交互逻辑（话术选择）
        // --------------------------
        // 渲染下拉选项（搜索筛选）
        function renderDropdown(filterText = '') {
            dropdownPanel.innerHTML = '';
            const filterVal = filterText.toLowerCase().trim();
            const filtered = appConfig.presetItems.filter(item =>
                item.key.toLowerCase().includes(filterVal)
            );

            if (filtered.length === 0) {
                const emptyItem = document.createElement('div');
                emptyItem.style.cssText = 'padding: 10px 15px;color: #999;font-size: 14px;';
                emptyItem.textContent = '无匹配话术';
                dropdownPanel.appendChild(emptyItem);
                return;
            }

            filtered.forEach(item => {
                const option = document.createElement('div');
                option.style.cssText = `
                    padding: 10px 15px;cursor: pointer;font-size: 14px;transition: background-color 0.2s;
                `;
                option.textContent = item.key;
                option.addEventListener('mouseover', () => option.style.background = '#f5f7fa');
                option.addEventListener('mouseout', () => option.style.background = 'transparent');
                option.addEventListener('click', async (e) => {
                    e.stopPropagation(); // 防止事件穿透
                    try {
                        searchInput.value = item.key;
                        dropdownPanel.style.display = 'none';
                        await fillTargetElement(item);
                    } catch (e) {
                        alert(`填充失败：${e.message}`);
                    }
                });
                dropdownPanel.appendChild(option);
            });
        }

        // 填充目标元素（增强选择器兼容性）
        async function fillTargetElement(item) {
            try {
                // 兼容不同的下拉选项结构
                const targetItemSelector = item.type === '促销或券类型'
                    ? '.gd-select-popper .el-select-dropdown__item:nth-child(1), .el-select-dropdown__item[data-label="促销或券类型"]'
                    : '.gd-select-popper .el-select-dropdown__item:nth-child(2), .el-select-dropdown__item[data-label="百亿补贴/单品补贴"]';
                
                const targetItem = await waitForSelector(targetItemSelector);
                targetItem.click();

                // 比例输入框（兼容不同class）
                const ratioInput = await waitForSelector('.el-input-number .el-input__inner, input[placeholder="比例"]');
                ratioInput.focus();
                ratioInput.value = item.ratio;
                ratioInput.dispatchEvent(new Event('input', { bubbles: true }));
                ratioInput.dispatchEvent(new Event('change', { bubbles: true }));
                ratioInput.blur();

                // 描述输入框（兼容不同class）
                const descInput = await waitForSelector('.el-form-item__content > .el-input > .el-input__inner, textarea[placeholder="优惠描述"]');
                descInput.focus();
                descInput.value = item.desc;
                descInput.dispatchEvent(new Event('input', { bubbles: true }));
                descInput.dispatchEvent(new Event('change', { bubbles: true }));
                descInput.blur();

            } catch (e) {
                console.error('填充目标元素失败', e);
                throw e;
            }
        }

        // 搜索框交互（修复失焦关闭问题）
        searchInput.addEventListener('focus', () => {
            renderDropdown(searchInput.value);
            dropdownPanel.style.display = 'block';
        });
        searchInput.addEventListener('input', () => {
            renderDropdown(searchInput.value);
            dropdownPanel.style.display = 'block';
        });
        // 阻止下拉面板内点击触发关闭
        dropdownPanel.addEventListener('click', (e) => e.stopPropagation());
        // 点击其他区域关闭下拉
        document.addEventListener('click', (e) => {
            if (!selectWrapper.contains(e.target)) {
                dropdownPanel.style.display = 'none';
            }
        });

        // 清空按钮逻辑
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            renderDropdown('');
        });

        // 设置按钮逻辑
        settingBtn.addEventListener('click', () => createFullSettingPanel());

        return barContainer;
    }

    // 4. 设置面板（优化交互和验证）
    function createFullSettingPanel() {
        // 防止重复创建
        if (document.getElementById('setting-mask')) return;

        const mask = document.createElement('div');
        mask.id = 'setting-mask';
        mask.style.cssText = `
            position: fixed;top:0;left:0;width:100vw;height:100vh;background: rgba(0,0,0,0.5);
            z-index: 10000;display: flex;align-items: center;justify-content: center;
            padding: 20px;box-sizing: border-box;
        `;

        const panel = document.createElement('div');
        panel.id = 'setting-panel';
        panel.style.cssText = `
            background: #fff;padding: 25px;border-radius: 8px;width: 90%;max-width: 800px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);max-height: 90vh;overflow-y: auto;
        `;

        // 标题
        const title = document.createElement('div');
        title.style.cssText = `
            font-size: 18px;font-weight: 600;margin-bottom: 20px;padding-bottom: 10px;
            border-bottom: 1px solid #eee;color: #333;
        `;
        title.textContent = '填充项设置';

        // 表格
        const table = document.createElement('table');
        table.style.cssText = 'width: 100%;border-collapse: collapse;margin-bottom: 20px;';
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        ['选项', '比例设置（0.5-1.0）', '优惠描述设置'].forEach(text => {
            const th = document.createElement('th');
            th.style.cssText = `
                padding: 12px 10px;text-align: left;border-bottom: 1px solid #f0f0f0;
                font-weight: 600;color: #333;background-color: #f8f9fa;
            `;
            th.textContent = text;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        const inputRefs = [];
        appConfig.presetItems.forEach((item, index) => {
            const row = document.createElement('tr');
            row.style.cssText = 'border-bottom: 1px solid #f0f0f0;';

            // 选项列
            const td1 = document.createElement('td');
            td1.style.cssText = 'padding: 12px 10px;color: #666;word-break: break-all;';
            td1.textContent = item.key;
            row.appendChild(td1);

            // 比例列
            const td2 = document.createElement('td');
            td2.style.cssText = 'padding: 12px 10px;';
            const ratioInput = document.createElement('input');
            ratioInput.style.cssText = `
                width: 100%;padding: 8px 10px;border: 1px solid #e5e6eb;
                border-radius: 6px;font-size: 14px;
            `;
            ratioInput.value = item.ratio;
            ratioInput.dataset.index = index;
            ratioInput.dataset.type = 'ratio';
            ratioInput.type = 'number';
            ratioInput.min = 0.5;
            ratioInput.max = 1.0;
            ratioInput.step = 0.1;
            inputRefs.push(ratioInput);
            td2.appendChild(ratioInput);
            row.appendChild(td2);

            // 描述列
            const td3 = document.createElement('td');
            td3.style.cssText = 'padding: 12px 10px;';
            const descInput = document.createElement('textarea');
            descInput.style.cssText = `
                width: 100%;padding: 8px 10px;border: 1px solid #e9ecef;
                border-radius: 6px;font-size: 14px;min-height: 40px;resize: vertical;
            `;
            descInput.value = item.desc;
            descInput.dataset.index = index;
            descInput.dataset.type = 'desc';
            inputRefs.push(descInput);
            td3.appendChild(descInput);
            row.appendChild(td3);

            tbody.appendChild(row);
        });
        table.appendChild(tbody);

        // 按钮区域
        const btnWrap = document.createElement('div');
        btnWrap.style.cssText = `
            display: flex;justify-content: flex-end;gap: 10px;margin-top: 25px;
            padding-top: 15px;border-top: 1px solid #eee;
        `;

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.style.cssText = `
            padding: 8px 16px;border: none;border-radius: 6px;
            background: #f5f5f5;color: #666;cursor: pointer;font-size: 14px;
            transition: background-color 0.2s;
        `;
        cancelBtn.addEventListener('mouseover', () => cancelBtn.style.background = '#e8e8e8');
        cancelBtn.addEventListener('mouseout', () => cancelBtn.style.background = '#f5f5f5');

        const saveBtn = document.createElement('button');
        saveBtn.textContent = '保存';
        saveBtn.style.cssText = `
            padding: 8px 16px;border: none;border-radius: 6px;
            background: #4096ff;color: #fff;cursor: pointer;font-size: 14px;
            transition: background-color 0.2s;
        `;
        saveBtn.addEventListener('mouseover', () => saveBtn.style.background = '#3385ff');
        saveBtn.addEventListener('mouseout', () => saveBtn.style.background = '#4096ff');

        btnWrap.appendChild(cancelBtn);
        btnWrap.appendChild(saveBtn);

        // 组装面板
        panel.appendChild(title);
        panel.appendChild(table);
        panel.appendChild(btnWrap);
        mask.appendChild(panel);
        document.body.appendChild(mask);

        // 关闭面板逻辑
        function closePanel() {
            if (document.getElementById('setting-mask')) {
                document.body.removeChild(mask);
            }
        }
        cancelBtn.addEventListener('click', closePanel);
        mask.addEventListener('click', (e) => e.target === mask && closePanel());
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.getElementById('setting-mask')) {
                closePanel();
            }
        });

        // 保存逻辑（增强验证）
        saveBtn.addEventListener('click', () => {
            let isValid = true;
            inputRefs.forEach(input => {
                if (!isValid) return;
                
                const index = parseInt(input.dataset.index);
                const type = input.dataset.type;
                const value = input.value.trim();

                // 比例验证
                if (type === 'ratio') {
                    const numValue = Number(value);
                    if (isNaN(numValue) || numValue < 0.5 || numValue > 1.0) {
                        isValid = false;
                        alert(`第${index+1}项比例错误！请输入0.5-1.0之间的数字`);
                        input.focus();
                        return;
                    }
                    appConfig.presetItems[index][type] = numValue.toString();
                }

                // 描述验证
                if (type === 'desc') {
                    if (!value) {
                        isValid = false;
                        alert(`第${index+1}项优惠描述不能为空！`);
                        input.focus();
                        return;
                    }
                    appConfig.presetItems[index][type] = value;
                }
            });

            if (isValid) {
                saveConfig();
                closePanel();
                alert('配置保存成功！');
            }
        });
    }

    // 初始化观察者（优化触发时机）
    function initObserver() {
        loadConfig();

        // 使用MutationObserver替代定时器（性能更优）
        const observer = new MutationObserver((mutations) => {
            const targetContainer = document.querySelector('div.promotion-item-row');
            if (targetContainer && !document.getElementById('promotion-fill-bar')) {
                const functionBar = createFunctionBar();
                targetContainer.insertBefore(functionBar, targetContainer.firstChild);
                observer.disconnect(); // 插入后停止观察
            }
        });

        // 监听页面DOM变化
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: false
        });

        // 备用定时器（防止Observer失效）
        const checkInterval = setInterval(() => {
            const targetContainer = document.querySelector('div.promotion-item-row');
            if (targetContainer && !document.getElementById('promotion-fill-bar')) {
                const functionBar = createFunctionBar();
                targetContainer.insertBefore(functionBar, targetContainer.firstChild);
                clearInterval(checkInterval);
            }
        }, 300);

        // 页面卸载时清理
        window.addEventListener('beforeunload', () => {
            observer.disconnect();
            clearInterval(checkInterval);
        });
    }

    // 确保DOM加载完成后启动
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initObserver();
    } else {
        document.addEventListener('DOMContentLoaded', initObserver);
    }
})();
