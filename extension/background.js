// 墨转是纯前端工具，没有后台逻辑。点击工具栏图标时在与 Web 版一致的
// 完整标签页里打开应用：弹出页会被 Chrome 限制在 800x600，且点击页面外
// 就会关闭，容易打断导入 / 预览 / 下载流程。
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});
