/**
 * 自定义 tabBar：白色悬浮胶囊。
 * 原生 tabBar 由客户端渲染，无法设置圆角/阴影/悬浮留白，因此改用 custom-tab-bar 组件。
 * app.json 的 tabBar.list 仍保留（用于声明 tab 页与 switchTab），选中态由各 tab 页
 * onShow 调用 utils/tabbar.ts 的 syncTabBar 同步。
 */
const LIST = [
  { pagePath: '/pages/home/home', text: '学习', iconPath: '/assets/tab/home.png', selectedIconPath: '/assets/tab/home-active.png' },
  { pagePath: '/pages/passage-list/passage-list', text: '短文记词', iconPath: '/assets/tab/passage.png', selectedIconPath: '/assets/tab/passage-active.png' },
  { pagePath: '/pages/wordbook/wordbook', text: '生词本', iconPath: '/assets/tab/wordbook.png', selectedIconPath: '/assets/tab/wordbook-active.png' },
  { pagePath: '/pages/library/library', text: '词库', iconPath: '/assets/tab/library.png', selectedIconPath: '/assets/tab/library-active.png' },
  { pagePath: '/pages/settings/settings', text: '我的', iconPath: '/assets/tab/settings.png', selectedIconPath: '/assets/tab/settings-active.png' }
];

Component({
  data: {
    selected: 0,
    list: LIST
  },
  methods: {
    onTap(event) {
      const { path, index } = event.currentTarget.dataset;
      if (!path) return;
      if (Number(index) === this.data.selected) return;
      wx.switchTab({ url: path });
    }
  }
});
