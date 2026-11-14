/**
 * E2E 验证脚本：通过 miniprogram-automator 直连微信开发者工具自动化端口，
 * 无需 UI 自动化即可校验页面数据与 console。
 * 用法：node scripts/e2e-verify.mjs（需 devtools 服务端口已开启）
 */
import automator from 'miniprogram-automator';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✔' : '✘'} ${name}${detail ? '  → ' + detail : ''}`);
};

/** 读取页面上的隐形热区及其 data-rating（只读，不改写数据）。 */
const zoneInfo = async (page) => {
  const zones = (await page.$$('.tap-zone')) || [];
  const ratings = [];
  for (const zone of zones) ratings.push(await zone.attribute('data-rating'));
  return { zones, ratings };
};

/** 词条详情页热区用 data-side 表示左右（这里没有「认识 / 不认识」语义）。 */
const sideInfo = async (page) => {
  const zones = (await page.$$('.tap-zone')) || [];
  const sides = [];
  for (const zone of zones) sides.push(await zone.attribute('data-side'));
  return { zones, sides };
};

/** 热区必须是完全透明的，不产生任何可见视觉元素。 */
const isInvisible = (bg) => {
  const norm = String(bg ?? '').replace(/\s/g, '');
  return norm === '' || norm === 'transparent' || norm === 'rgba(0,0,0,0)';
};

// 0. 静态配置：5 个 tab，短文记词位于学习与生词本之间；进度降级为「我的」内二级入口
{
  const appJson = JSON.parse(fs.readFileSync(path.join(PROJECT, 'miniprogram', 'app.json'), 'utf8'));
  const labels = appJson.tabBar.list.map((item) => item.text);
  check(
    'tabBar 5 项且短文记词位于学习/生词本之间',
    labels.length === 5 && labels[0] === '学习' && labels[1] === '短文记词' &&
      labels[2] === '生词本' && labels[3] === '词库' && labels[4] === '我的',
    labels.join(' / ')
  );
  check(
    '进度页仍注册在 pages 中但已不是 tab 页',
    appJson.pages.includes('pages/progress/progress') &&
      !appJson.tabBar.list.some((item) => item.pagePath === 'pages/progress/progress')
  );
  check('自定义 tabBar 已启用（悬浮胶囊）', appJson.tabBar.custom === true);
  check(
    'custom-tab-bar 组件四个文件齐全',
    ['index.js', 'index.json', 'index.wxml', 'index.wxss'].every((name) =>
      fs.existsSync(path.join(PROJECT, 'miniprogram', 'custom-tab-bar', name)))
  );
}

const mp = await automator.launch({
  cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
  projectPath: PROJECT
});

const consoleLogs = [];
mp.on('console', (msg) => consoleLogs.push(`[${msg.type}] ${msg.args?.join(' ')}`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pageData = async (path, waitMs = 1500) => {
  const page = await mp.reLaunch(path);
  await sleep(waitMs);
  return { page, data: await page.data() };
};

// 引导层会盖住热区：默认把两个一次性标记都置为「已看过」，保证既有回归断言不被遮挡；
// 原始值在脚本结束前恢复，不改变真机 / 模拟器里真实的首次使用体验。
const HINT_KEY = 'word-atlas:tap-zone-hint:v1';
const DETAIL_HINT_KEY = 'word-atlas:detail-zone-hint:v1';
const hintBefore = await mp.callWxMethod('getStorageSync', HINT_KEY);
const detailHintBefore = await mp.callWxMethod('getStorageSync', DETAIL_HINT_KEY);
await mp.callWxMethod('setStorageSync', HINT_KEY, true);
await mp.callWxMethod('setStorageSync', DETAIL_HINT_KEY, true);

// 1. 词详情（vocab-a chunk 0 的 library）+ 完整释义 + 媒体可达性
{
  const { data } = await pageData('/pages/word-detail/word-detail?id=library');
  check('详情页 library（vocab-a/chunk0）', !!data.word && !data.notFound,
    data.word ? `"${data.word.word}" ${data.word.meaningCN} | ${data.word.topicId}` : 'notFound=' + data.notFound);
  check('详情页完整释义数据（全义项/双例句/同反义词，界面只展示首条例句）',
    !!data.word && Array.isArray(data.word.senses) && data.word.senses.length >= 1
      && Array.isArray(data.word.examples) && data.word.examples.length >= 2
      && Array.isArray(data.word.synonyms) && Array.isArray(data.word.antonyms),
    data.word ? `义项 ${data.word.senses?.length} · 例句 ${data.word.examples?.length} · 同义词 ${data.word.synonyms?.length} · 反义词 ${data.word.antonyms?.length}` : 'no word');
  if (data.word) {
    const res = await fetch(data.word.imageUrl);
    check('详情页图片 URL 可达（云 CDN）', res.status === 200,
      `${res.status} ${res.headers.get('content-type') ?? ''} ${data.word.imageUrl}`);
  }
}

// 2. 词详情（vocab-c chunk 9 的 exhaustion，跨分包详情行）
{
  const { data } = await pageData('/pages/word-detail/word-detail?id=exhaustion');
  check('详情页 exhaustion（vocab-c/chunk9）', !!data.word && !data.notFound,
    data.word ? `"${data.word.word}" ${data.word.example?.slice(0, 40)}` : 'notFound=' + data.notFound);
}

// 模拟器当天可能已学满今日新词（study.ts 会置 empty=true），导致学习页词卡、
// 左右热区与首次引导层连锁不渲染。通过真实设置 UI 临时把每日新词调到最大档，
// 结束时再点回原值：内存 store 与 storage 都会同步更新，不污染真实使用状态。
let dailyRestoreTo = null;
{
  const setup = await mp.reLaunch('/pages/settings/settings');
  await sleep(1200);
  const setupData = await setup.data();
  dailyRestoreTo = setupData.dailyNewWords;
  const tags = (await setup.$$('.tag')) || [];
  let maxTag = null;
  let maxValue = -1;
  for (const tag of tags) {
    const value = Number(await tag.attribute('data-value'));
    if (!Number.isNaN(value) && value > maxValue) {
      maxValue = value;
      maxTag = tag;
    }
  }
  if (maxTag && maxValue > dailyRestoreTo) await maxTag.tap();
  await sleep(400);
}

// 3. 学习页能出词卡；左右隐形热区与「不认识 / 认识」按钮等价
const STORAGE_KEY = 'word-atlas:appdata:v1';
let sampleWord = null;
{
  // IDE 冷启动后首次编译分包较慢，等待放宽，避免误判 empty=true
  const { page, data } = await pageData('/pages/study/study', 3500);
  check('学习页出词卡', !!data.current && !data.empty,
    data.current ? `"${data.current.word}" collocations=${data.current.collocations?.length}` : 'empty=' + data.empty);
  sampleWord = data.current;

  const { zones, ratings } = await zoneInfo(page);
  check('学习页左右隐形热区（2 个）', zones.length === 2, `节点数 ${zones.length}`);
  check('学习页左=不认识 / 右=认识', ratings.includes('unknown') && ratings.includes('known'), ratings.join(' / '));
  if (zones.length) {
    const bg = await zones[0].style('background-color');
    check('学习页热区不显性显示', isInvisible(bg), `background-color=${bg}`);
  }

  // 点击等价性会写学习记录：先备份 storage，结束前原样恢复，保证 E2E 可反复运行
  const before = await mp.callWxMethod('getStorageSync', STORAGE_KEY);
  try {
    const left = zones.find((_, i) => ratings[i] === 'unknown');
    if (left) {
      await left.tap();
      await sleep(400);
      const afterLeft = await page.data();
      check('学习页左热区等价「不认识」', afterLeft.rated === true && afterLeft.showMeaning === true,
        `rated=${afterLeft.rated} showMeaning=${afterLeft.showMeaning}`);
    }
    // 重新进入学习页恢复未评分状态，再验证右热区
    const { page: study2 } = await pageData('/pages/study/study', 2500);
    const { zones: zones2, ratings: ratings2 } = await zoneInfo(study2);
    const right = zones2.find((_, i) => ratings2[i] === 'known');
    if (right) {
      await right.tap();
      await sleep(400);
      const afterRight = await study2.data();
      check('学习页右热区等价「认识」', afterRight.index === 1 && afterRight.rated === false,
        `index=${afterRight.index} rated=${afterRight.rated}`);
    }
  } catch (error) {
    check('学习页热区点击等价性（执行异常）', false, error.message);
  } finally {
    if (before) await mp.callWxMethod('setStorageSync', STORAGE_KEY, before);
    else await mp.callWxMethod('removeStorageSync', STORAGE_KEY);
  }
}

// 4. 词库页 7298 列表
{
  const { data } = await pageData('/pages/library/library');
  check('词库页列表', Array.isArray(data.list) && data.list.length > 0 && data.total === 7298,
    `本页 ${data.list?.length} 条 / 共 ${data.total}`);
}

// 5. 复习页左右隐形热区：注入一张词卡，验证存在、映射与点击等价性
{
  const review = await mp.reLaunch('/pages/review/review');
  await sleep(1200);
  if (review && sampleWord) {
    await review.setData({
      current: sampleWord,
      words: [sampleWord],
      total: 1,
      index: 0,
      loading: false,
      empty: false,
      finished: false,
      showAnswer: false,
      correct: 0,
      reviewed: 0
    });
    await sleep(400);
    const { zones, ratings } = await zoneInfo(review);
    check('复习页左右隐形热区（2 个）', zones.length === 2, `节点数 ${zones.length}`);
    check('复习页左=不认识 / 右=认识', ratings.includes('unknown') && ratings.includes('known'), ratings.join(' / '));

    const before = await mp.callWxMethod('getStorageSync', STORAGE_KEY);
    try {
      const left = zones.find((_, i) => ratings[i] === 'unknown');
      if (left) {
        await left.tap();
        await sleep(300);
        const afterLeft = await review.data();
        check('复习页左热区等价「不认识」（翻开答案）', afterLeft.showAnswer === true,
          `showAnswer=${afterLeft.showAnswer}`);
      }
      await review.setData({ showAnswer: false });
      const { zones: zones2, ratings: ratings2 } = await zoneInfo(review);
      const right = zones2.find((_, i) => ratings2[i] === 'known');
      if (right) {
        await right.tap();
        await sleep(300);
        const afterRight = await review.data();
        check('复习页右热区等价「认识」（过卡）', afterRight.finished === true,
          `finished=${afterRight.finished}`);
      }
    } catch (error) {
      check('复习页热区点击等价性（执行异常）', false, error.message);
    } finally {
      if (before) await mp.callWxMethod('setStorageSync', STORAGE_KEY, before);
      else await mp.callWxMethod('removeStorageSync', STORAGE_KEY);
    }
  }
}

// 6. 首次使用引导：清空标记后验证引导出现、左右指示可评分、关闭后不再出现
{
  const beforeAppData = await mp.callWxMethod('getStorageSync', STORAGE_KEY);
  try {
    await mp.callWxMethod('removeStorageSync', HINT_KEY);
    const { page, data } = await pageData('/pages/study/study', 2500);
    check('首次进入学习页显示热区引导', data.showTapHint === true, `showTapHint=${data.showTapHint}`);
    const guide = await page.$('.tap-guide');
    check('首次引导层可见', !!guide, guide ? '已找到 .tap-guide' : '缺失');

    const sides = (await page.$$('.tap-guide-side')) || [];
    const sideRatings = [];
    for (const side of sides) sideRatings.push(await side.attribute('data-rating'));
    check('引导左右指示与热区一一对应',
      sides.length === 2 && sideRatings.includes('unknown') && sideRatings.includes('known'),
      `节点数 ${sides.length}：${sideRatings.join(' / ')}`);

    const panel = await page.$('.tap-guide-panel');
    check('中间提示框已移除', !panel, panel ? '仍存在 .tap-guide-panel' : '无中间面板');
    const words = (await page.$$('.tap-guide-word')) || [];
    const arrows = (await page.$$('.tap-guide-arrow')) || [];
    check('框内只保留提示词', words.length === 5 && arrows.length === 0,
      `提示词 ${words.length} 个 / 箭头 ${arrows.length} 个`);
    if (sides.length) {
      const sideBg = await sides[0].style('background-color');
      check('左右提示框内部透明', isInvisible(sideBg), `background-color=${sideBg}`);
      const borderStyles = [];
      for (const edge of ['border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style']) {
        borderStyles.push(await sides[0].style(edge));
      }
      check('提示框四边均为虚线', borderStyles.every((s) => s === 'dashed'), borderStyles.join(' / '));
    }

    // 引导视觉证据：并入同一次连接，避免 automator 二次 launch 失败
    if (process.env.E2E_SCREENSHOT) {
      const hintShot = process.env.E2E_SCREENSHOT.replace(/\.png$/, '-hint.png');
      await mp.screenshot({ path: hintShot });
      console.log(`引导截图已保存: ${hintShot}`);
    }

    const leftSide = sides.find((_, i) => sideRatings[i] === 'unknown');
    if (leftSide) {
      await leftSide.tap();
      await sleep(400);
      const after = await page.data();
      check('引导左指示等价「不认识」且自动关闭',
        after.rated === true && after.showMeaning === true && after.showTapHint === false,
        `rated=${after.rated} showMeaning=${after.showMeaning} showTapHint=${after.showTapHint}`);
    }
    const hintAfter = await mp.callWxMethod('getStorageSync', HINT_KEY);
    check('看过引导后写入一次性标记', hintAfter === true, `hint=${String(hintAfter)}`);

    const { data: again } = await pageData('/pages/study/study', 2500);
    check('再次进入学习页不再提示', again.showTapHint === false, `showTapHint=${again.showTapHint}`);

    // 点引导层空白处（非左右框）：只关闭引导、不评分
    await mp.callWxMethod('removeStorageSync', HINT_KEY);
    const { page: page3 } = await pageData('/pages/study/study', 2500);
    const guide3 = await page3.$('.tap-guide');
    if (guide3) {
      await guide3.tap();
      await sleep(300);
      const after3 = await page3.data();
      check('点引导层空白处关闭且不评分',
        after3.showTapHint === false && after3.rated === false,
        `showTapHint=${after3.showTapHint} rated=${after3.rated}`);
    }

    // 复习页共用同一标记：首次进入也提示，词卡出现时引导层可见
    await mp.callWxMethod('removeStorageSync', HINT_KEY);
    const { page: reviewHint, data: reviewHintData } = await pageData('/pages/review/review', 1200);
    check('复习页首次使用同样提示', reviewHintData.showTapHint === true,
      `showTapHint=${reviewHintData.showTapHint}`);
    if (reviewHint && sampleWord) {
      await reviewHint.setData({
        current: sampleWord,
        words: [sampleWord],
        total: 1,
        index: 0,
        loading: false,
        empty: false,
        finished: false,
        showAnswer: false,
        correct: 0,
        reviewed: 0
      });
      await sleep(400);
      const reviewGuide = await reviewHint.$('.tap-guide');
      check('复习页词卡上出现引导层', !!reviewGuide,
        reviewGuide ? '已找到 .tap-guide' : '缺失');
    }
  } catch (error) {
    check('首次使用引导（执行异常）', false, error.message);
  } finally {
    if (beforeAppData) await mp.callWxMethod('setStorageSync', STORAGE_KEY, beforeAppData);
    else await mp.callWxMethod('removeStorageSync', STORAGE_KEY);
    // 后续截图分支需要无引导的标准页面
    await mp.callWxMethod('setStorageSync', HINT_KEY, true);
  }
}

// 7. 已评分（展开释义）态：左侧＝隐藏释义、右侧＝下一个；只用 setData 造状态，不写 storage
{
  const { page } = await pageData('/pages/study/study', 2500);
  await page.setData({
    current: sampleWord,
    words: [sampleWord, sampleWord],
    total: 2,
    index: 0,
    rated: true,
    showMeaning: true,
    showTapHint: false,
    loading: false,
    empty: false,
    finished: false
  });
  await sleep(300);
  const { zones, ratings } = await zoneInfo(page);
  check('已评分态热区仍存在', zones.length === 2, `节点数 ${zones.length}`);
  const left = zones.find((_, i) => ratings[i] === 'unknown');
  if (left) {
    await left.tap();
    await sleep(300);
    const after = await page.data();
    check('已评分态左热区＝隐藏释义',
      after.showMeaning === false && after.rated === true && after.index === 0,
      `showMeaning=${after.showMeaning} rated=${after.rated} index=${after.index}`);
  }
  // showMeaning 变化会重渲染，重新取一次节点再验证右侧
  const { zones: zones2, ratings: ratings2 } = await zoneInfo(page);
  const right = zones2.find((_, i) => ratings2[i] === 'known');
  if (right) {
    await right.tap();
    await sleep(300);
    const after = await page.data();
    check('已评分态右热区＝下一个',
      after.index === 1 && after.rated === false && after.showMeaning === false,
      `index=${after.index} rated=${after.rated} showMeaning=${after.showMeaning}`);
  }
}

// 8. 词条详情页左右热区（右＝下一个单词、左＝标记已学）与独立的首次提示
{
  const beforeAppData = await mp.callWxMethod('getStorageSync', STORAGE_KEY);
  try {
    const { page, data } = await pageData('/pages/word-detail/word-detail?id=library', 2000);
    check('详情页常态无引导（标记已看过）', data.showDetailHint === false,
      `showDetailHint=${data.showDetailHint}`);
    const { zones, sides } = await sideInfo(page);
    check('详情页左右隐形热区（2 个）', zones.length === 2, `节点数 ${zones.length}`);
    check('详情页左=标记已学 / 右=下一个单词',
      sides.includes('left') && sides.includes('right'), sides.join(' / '));
    if (zones.length) {
      const bg = await zones[0].style('background-color');
      check('详情页热区不显性显示', isInvisible(bg), `background-color=${bg}`);
    }

    // 左热区＝标记已学（写学习记录，finally 中恢复）
    const left = zones.find((_, i) => sides[i] === 'left');
    if (left) {
      await left.tap();
      await sleep(400);
      const after = await page.data();
      check('详情页左热区＝标记已学', after.statusLabel === '已掌握',
        `statusLabel=${after.statusLabel}`);
    }

    // 右热区＝下一个单词（页面内 redirectTo，取当前页数据核对词条变化）
    const { page: page2 } = await pageData('/pages/word-detail/word-detail?id=library', 2000);
    const { zones: zones2, sides: sides2 } = await sideInfo(page2);
    const right = zones2.find((_, i) => sides2[i] === 'right');
    if (right) {
      const beforeId = (await page2.data()).word?.id;
      await right.tap();
      await sleep(2000);
      const now = await mp.currentPage();
      const after = now ? await now.data() : {};
      check('详情页右热区＝下一个单词', !!after.word && after.word.id !== beforeId,
        `${beforeId} → ${after.word?.id ?? '无'}`);
    }

    // 独立标记的首次提示
    await mp.callWxMethod('removeStorageSync', DETAIL_HINT_KEY);
    const { page: hintPage, data: hintData } = await pageData('/pages/word-detail/word-detail?id=library', 2000);
    check('首次进入详情页显示左右提示', hintData.showDetailHint === true,
      `showDetailHint=${hintData.showDetailHint}`);
    const guide = await hintPage.$('.tap-guide');
    check('详情页引导层可见', !!guide, guide ? '已找到 .tap-guide' : '缺失');
    const guideSides = (await hintPage.$$('.tap-guide-side')) || [];
    const guideSideValues = [];
    for (const el of guideSides) guideSideValues.push(await el.attribute('data-side'));
    check('详情页引导左右映射正确',
      guideSides.length === 2 && guideSideValues.includes('left') && guideSideValues.includes('right'),
      `节点数 ${guideSides.length}：${guideSideValues.join(' / ')}`);
    const wordsCount = ((await hintPage.$$('.tap-guide-word')) || []).length;
    check('详情页引导提示词为「标记已学 / 下一个单词」', wordsCount === 9, `提示词 ${wordsCount} 个`);
    if (guideSides.length) {
      const sideBg = await guideSides[0].style('background-color');
      check('详情页引导框内部透明', isInvisible(sideBg), `background-color=${sideBg}`);
      const borderStyles = [];
      for (const edge of ['border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style']) {
        borderStyles.push(await guideSides[0].style(edge));
      }
      check('详情页引导框四边虚线', borderStyles.every((s) => s === 'dashed'), borderStyles.join(' / '));
    }
    if (process.env.E2E_SCREENSHOT) {
      const detailHintShot = process.env.E2E_SCREENSHOT.replace(/\.png$/, '-detail-hint.png');
      await mp.screenshot({ path: detailHintShot });
      console.log(`详情页引导截图已保存: ${detailHintShot}`);
    }
    if (guide) {
      await guide.tap();
      await sleep(300);
      const after = await hintPage.data();
      check('详情页引导可关闭且不误触发动作',
        after.showDetailHint === false && after.word?.id === 'library',
        `showDetailHint=${after.showDetailHint} id=${after.word?.id}`);
    }
    const hintAfter = await mp.callWxMethod('getStorageSync', DETAIL_HINT_KEY);
    check('详情页提示写入独立标记', hintAfter === true, `hint=${String(hintAfter)}`);
    const { data: again } = await pageData('/pages/word-detail/word-detail?id=library', 2000);
    check('再次进入详情页不再提示', again.showDetailHint === false,
      `showDetailHint=${again.showDetailHint}`);

    // 引导未关闭时直接点底部「下一个单词」按钮：跳到新词后不应重复提示
    await mp.callWxMethod('removeStorageSync', DETAIL_HINT_KEY);
    const { page: btnPage } = await pageData('/pages/word-detail/word-detail?id=library', 2000);
    const nextBtn = await btnPage.$('.detail-actions .btn-primary');
    if (nextBtn) {
      await nextBtn.tap();
      await sleep(2000);
      const now = await mp.currentPage();
      const after = now ? await now.data() : {};
      check('底部按钮跳词后不再重复提示', after.showDetailHint === false,
        `showDetailHint=${after.showDetailHint}`);
    }
  } catch (error) {
    check('详情页热区 / 提示（执行异常）', false, error.message);
  } finally {
    if (beforeAppData) await mp.callWxMethod('setStorageSync', STORAGE_KEY, beforeAppData);
    else await mp.callWxMethod('removeStorageSync', STORAGE_KEY);
    // 截图分支需要无引导的标准详情页
    await mp.callWxMethod('setStorageSync', DETAIL_HINT_KEY, true);
  }
}

// 9. 生词本：首页默认本、新建/重命名、词表四分类与遮挡菜单、添加生词、开始学习、极速刷词
{
  const beforeAppData = await mp.callWxMethod('getStorageSync', STORAGE_KEY);
  try {
    const { page: wbPage, data: wbData } = await pageData('/pages/wordbook/wordbook', 1200);
    check(
      '生词本首页存在默认生词本',
      Array.isArray(wbData.books) && wbData.books.length >= 1 && wbData.books[0].id === 'default',
      `本数=${wbData.books?.length} 首本=${wbData.books?.[0]?.id}`
    );
    check('默认生词本名称正确', wbData.books?.[0]?.name === '默认生词本', wbData.books?.[0]?.name);

    // 新建（真实写入 AppData）；用 setData 填名称，避免依赖输入框 API
    const createBtn = await wbPage.$('.create-btn');
    if (createBtn) {
      await createBtn.tap();
      await sleep(300);
      await wbPage.setData({ draftName: 'E2E 测试本' });
      const confirm = await wbPage.$('.wb-dialog .wb-primary');
      if (confirm) await confirm.tap();
      await sleep(400);
      const afterCreate = await wbPage.data();
      check(
        '可新建生词本',
        afterCreate.books.length === wbData.books.length + 1,
        `本数 ${wbData.books.length} → ${afterCreate.books.length}`
      );
      check(
        '新生词本名称正确',
        afterCreate.books[afterCreate.books.length - 1]?.name === 'E2E 测试本',
        afterCreate.books[afterCreate.books.length - 1]?.name
      );

      // 重命名：编辑按钮在最后一个卡片上
      const editBtns = (await wbPage.$$('.edit-btn')) || [];
      const lastEdit = editBtns[editBtns.length - 1];
      if (lastEdit) {
        await lastEdit.tap();
        await sleep(300);
        await wbPage.setData({ draftName: 'E2E 重命名本' });
        const confirmRename = await wbPage.$('.wb-dialog .wb-primary');
        if (confirmRename) await confirmRename.tap();
        await sleep(400);
        const afterRename = await wbPage.data();
        check(
          '可重命名生词本',
          afterRename.books[afterRename.books.length - 1]?.name === 'E2E 重命名本',
          afterRename.books[afterRename.books.length - 1]?.name
        );
      }
    }

    // 词表页：四分类、默认遮挡模式、菜单项
    const { page: listPage, data: listData } = await pageData(
      '/pages/wordbook-list/wordbook-list?id=default',
      1200
    );
    check('词表页加载成功', listData.notFound === false && Array.isArray(listData.rows),
      `notFound=${listData.notFound} rows=${listData.rows?.length}`);
    check(
      '词表页四个分类 tab',
      listData.tabs?.length === 4 &&
        listData.tabs.map((item) => item.label).join('/') === '今日任务/在学单词/未学单词/简单词',
      listData.tabs?.map((item) => item.label).join('/')
    );
    // 不依赖初始模式：E2E 复用同一小程序实例，上一轮可能改过内存态
    check(
      '词表遮挡模式为合法枚举',
      ['none', 'meaning', 'word'].includes(listData.maskMode),
      listData.maskMode
    );

    // 「添加生词」真实写入：构造弹层与搜索结果后点结果，验证写入默认本
    const more = await listPage.$('.wb-more');
    if (more) {
      await more.tap();
      await sleep(200);
      await listPage.setData({
        menuOpen: false,
        dialog: 'add',
        searchKeyword: 'library',
        searchResults: [{ id: 'library', word: 'library', meaningCN: '图书馆', pos: 'n.', cefr: 'A1' }]
      });
      await sleep(300);
      const option = await listPage.$('.wb-dialog .wb-option');
      if (option) await option.tap();
      await sleep(400);
    }
    const { data: wbAfterAdd } = await pageData('/pages/wordbook/wordbook', 900);
    check(
      '添加生词写入默认生词本',
      !!wbAfterAdd.books?.[0]?.wordIds?.includes('library'),
      `默认本词数=${wbAfterAdd.books?.[0]?.wordIds?.length}`
    );

    // 菜单：4 个操作 + 3 个遮挡单选项；点「不遮挡」验证模式写入
    const { page: list2 } = await pageData('/pages/wordbook-list/wordbook-list?id=default', 1000);
    await list2.setData({ menuOpen: true });
    await sleep(250);
    const menuItems = (await list2.$$('.wb-menu .wb-menu-item')) || [];
    check('词表菜单含 7 项（4 操作 + 3 遮挡）', menuItems.length === 7, `节点数 ${menuItems.length}`);
    // 菜单第 6 项＝遮挡释义
    if (menuItems[5]) {
      await menuItems[5].tap();
      await sleep(300);
    }
    const afterMaskMeaning = await list2.data();
    check('可切换遮挡模式为遮挡释义', afterMaskMeaning.maskMode === 'meaning', afterMaskMeaning.maskMode);
    // chooseMask 会关闭菜单，重新打开后点第 5 项＝不遮挡
    await list2.setData({ menuOpen: true });
    await sleep(200);
    const menuItems2 = (await list2.$$('.wb-menu .wb-menu-item')) || [];
    if (menuItems2[4]) {
      await menuItems2[4].tap();
      await sleep(300);
    }
    const afterMask = await list2.data();
    check('可切换遮挡模式为不遮挡', afterMask.maskMode === 'none', afterMask.maskMode);

    // 「开始学习」复用学习页；带 wordbook 参数时不受每日新词限额限制
    const studyFromBook = await mp.reLaunch('/pages/study/study?wordbook=default');
    await sleep(2500);
    const studyData = studyFromBook ? await studyFromBook.data() : {};
    check(
      '生词本开始学习复用学习页出词卡',
      !!studyData.current && !studyData.empty,
      studyData.current ? `"${studyData.current.word}" total=${studyData.total}` : `empty=${studyData.empty}`
    );

    // 极速刷词页
    const rush = await mp.reLaunch('/pages/wordbook-rush/wordbook-rush?id=default');
    await sleep(2000);
    const rushData = rush ? await rush.data() : {};
    check(
      '极速刷词页出词卡',
      !!rushData.current && rushData.total >= 1,
      rushData.current ? `"${rushData.current.word}" total=${rushData.total}` : `empty=${rushData.empty}`
    );
  } catch (error) {
    check('生词本（执行异常）', false, error.message);
  } finally {
    // 与既有断言一致：写 AppData 的用例备份 + 原样恢复，E2E 可反复运行
    if (beforeAppData) await mp.callWxMethod('setStorageSync', STORAGE_KEY, beforeAppData);
    else await mp.callWxMethod('removeStorageSync', STORAGE_KEY);
  }
}

// 10. 本轮修复回归：发音调用与偏好联动、完整释义、返回文案、弹层输入框、默认本、五角星
{
  const beforeAppData = await mp.callWxMethod('getStorageSync', STORAGE_KEY);
  try {
    // 10.1 极速刷词：播放发音（英音/美音按偏好取） + 展开全部释义
    const { page: rushPage, data: rushData } = await pageData(
      '/pages/wordbook-rush/wordbook-rush?id=default',
      2000
    );
    check('极速刷词出词卡并含完整义项/例句',
      !!rushData.current && Array.isArray(rushData.current.senses) && Array.isArray(rushData.current.examples),
      rushData.current ? `义项 ${rushData.current.senses?.length} · 例句 ${rushData.current.examples?.length}` : 'no word');
    const rushAudio = await rushPage.$('.rush-audio');
    if (rushAudio) {
      await rushAudio.tap();
      await sleep(400);
    }
    const afterRushPlay = await rushPage.data();
    check('极速刷词点击播放发音触发音频',
      !!afterRushPlay.lastPlayUrl && afterRushPlay.lastPlayUrl.includes('/audio/'),
      afterRushPlay.lastPlayUrl || '无');
    const rushMask = await rushPage.$('.rush-mask');
    if (rushMask) {
      await rushMask.tap();
      await sleep(300);
    }
    const expanded = await rushPage.data();
    const senseNodes = (await rushPage.$$('.r-sense')) || [];
    const sentenceNodes = (await rushPage.$$('.r-sentence')) || [];
    check('极速刷词展开全部义项且例句只展示一条',
      expanded.showMeaning === true && senseNodes.length >= 1 && sentenceNodes.length === 1,
      `showMeaning=${expanded.showMeaning} 义项节点 ${senseNodes.length} 例句节点 ${sentenceNodes.length}`);

    // 10.2 「我的」切到美音 → 词表喇叭用 audio/us；切回英音 → audio/uk
    const settingsPage = await mp.reLaunch('/pages/settings/settings');
    await sleep(1000);
    const accentTags = (await settingsPage.$$('.tag')) || [];
    let usTag = null;
    let ukTag = null;
    for (const tag of accentTags) {
      const value = await tag.attribute('data-accent');
      if (value === 'us') usTag = tag;
      if (value === 'uk') ukTag = tag;
    }
    if (usTag) {
      await usTag.tap();
      await sleep(300);
    }
    const { page: usList, data: usListData } = await pageData(
      '/pages/wordbook-list/wordbook-list?id=default',
      1200
    );
    check('词表发音跟随「我的」美音偏好',
      usListData.accent === 'us' && !!usListData.rows?.[0]?.audioUrl?.includes('/audio/us/'),
      `accent=${usListData.accent} url=${usListData.rows?.[0]?.audioUrl ?? '无词条'}`);
    const usSpeaker = await usList.$('.wb-speaker');
    if (usSpeaker && usListData.rows?.length) {
      await usSpeaker.tap();
      await sleep(400);
      const afterUsTap = await usList.data();
      check('词表喇叭点击触发美音播放',
        afterUsTap.lastPlayUrl === usListData.rows[0].audioUrl,
        afterUsTap.lastPlayUrl || '无');
    }
    if (ukTag) {
      const settings2 = await mp.reLaunch('/pages/settings/settings');
      await sleep(900);
      const tags2 = (await settings2.$$('.tag')) || [];
      for (const tag of tags2) {
        if ((await tag.attribute('data-accent')) === 'uk') {
          await tag.tap();
          break;
        }
      }
      await sleep(300);
    }
    const { page: ukList, data: ukListData } = await pageData(
      '/pages/wordbook-list/wordbook-list?id=default',
      1200
    );
    check('词表发音跟随「我的」英音偏好',
      ukListData.accent === 'uk' && !!ukListData.rows?.[0]?.audioUrl?.includes('/audio/uk/'),
      `accent=${ukListData.accent} url=${ukListData.rows?.[0]?.audioUrl ?? '无词条'}`);
    const ukSpeaker = await ukList.$('.wb-speaker');
    if (ukSpeaker && ukListData.rows?.length) {
      await ukSpeaker.tap();
      await sleep(400);
      const afterUkTap = await ukList.data();
      check('词表喇叭点击触发英音播放',
        afterUkTap.lastPlayUrl === ukListData.rows[0].audioUrl,
        afterUkTap.lastPlayUrl || '无');
    }

    // 10.3 结果页「返回生词本」文案（学习教育 & 小测两条路径）
    const studyFinish = await mp.reLaunch('/pages/study/study?wordbook=default');
    await sleep(1800);
    await studyFinish.setData({ finished: true, loading: false, empty: false });
    await sleep(300);
    const studyFinishData = await studyFinish.data();
    const studyBack = await studyFinish.$('.finish-actions .btn-ghost');
    let studyBackText = '';
    if (studyBack && typeof studyBack.text === 'function') studyBackText = await studyBack.text();
    check('生词本学习完成页显示「返回生词列表」',
      studyFinishData.wordbookId === 'default' && (!studyBackText || studyBackText.includes('返回生词列表')),
      `wordbookId=${studyFinishData.wordbookId} 文案=${studyBackText || '未取到'}`);
    if (studyBack) {
      await studyBack.tap();
      await sleep(2000);
      let tabsLength = 0;
      try {
        const now = await mp.currentPage();
        const currentData = now ? await now.data() : {};
        tabsLength = Array.isArray(currentData.tabs) ? currentData.tabs.length : 0;
      } catch (error) {
        // 页面切换尚未完成时忽略，下面按 tabsLength=0 记录失败
      }
      check('点击「返回生词列表」回到词表页', tabsLength === 4, `tabs=${tabsLength}`);
    }

    const practiceFinish = await mp.reLaunch('/pages/practice/practice?ids=library&wordbook=default');
    await sleep(1800);
    await practiceFinish.setData({ finished: true, loading: false, empty: false });
    await sleep(300);
    const practiceFinishData = await practiceFinish.data();
    const practiceBack = await practiceFinish.$('.result-actions .btn-primary');
    let practiceBackText = '';
    if (practiceBack && typeof practiceBack.text === 'function') practiceBackText = await practiceBack.text();
    check('生词本小测完成页显示「返回生词列表」',
      practiceFinishData.wordbookId === 'default' && (!practiceBackText || practiceBackText.includes('返回生词列表')),
      `wordbookId=${practiceFinishData.wordbookId} 文案=${practiceBackText || '未取到'}`);

    const normalStudy = await mp.reLaunch('/pages/study/study');
    await sleep(1500);
    const normalData = await normalStudy.data();
    check('普通学习来源仍显示「返回首页」', normalData.wordbookId === '', `wordbookId=${normalData.wordbookId}`);

    // 10.4 名称弹层输入框高度（不再被裁切）+ 默认本标记/设置入口
    const { page: wbHome } = await pageData('/pages/wordbook/wordbook', 1000);
    const wbHomeData = await wbHome.data();
    check('首页存在唯一默认生词本',
      !!wbHomeData.defaultWordbookId && wbHomeData.books.some((b) => b.id === wbHomeData.defaultWordbookId),
      `defaultWordbookId=${wbHomeData.defaultWordbookId}`);
    const createBtn2 = await wbHome.$('.create-btn');
    if (createBtn2) {
      await createBtn2.tap();
      await sleep(300);
      const input = await wbHome.$('.wb-input');
      if (input) {
        const height = parseFloat(await input.style('height')) || 0;
        check('新建/编辑弹层输入框高度完整', height >= 40, `height=${height}px`);
      }
    }
    const editBtns2 = (await wbHome.$$('.edit-btn')) || [];
    if (editBtns2.length) {
      // 打开最后一个本（非当前默认时才会出现「设为默认」）
      await editBtns2[editBtns2.length - 1].tap();
      await sleep(300);
      const editData = await wbHome.data();
      const setDefaultBtn = await wbHome.$('.wb-set-default');
      check('非默认本编辑弹层提供「设为默认生词本」',
        (!editData.isDefaultBook && !!setDefaultBtn) || (editData.isDefaultBook && !setDefaultBtn),
        `isDefaultBook=${editData.isDefaultBook} 按钮=${setDefaultBtn ? '有' : '无'}`);
      await wbHome.setData({ dialog: false });
    }

    // 10.5 五角星：词库列表与词条详情都能切换收藏
    const { page: libPage, data: libData } = await pageData('/pages/library/library', 1200);
    const stars = (await libPage.$$('.star')) || [];
    check('词库列表项显示五角星', stars.length > 0, `节点数 ${stars.length}`);
    if (stars.length) {
      const beforeStar = !!libData.list?.[0]?.starred;
      await stars[0].tap();
      await sleep(400);
      const afterStar = (await libPage.data()).list?.[0]?.starred;
      check('词库五角星点击切换收藏状态', afterStar === !beforeStar, `${beforeStar} → ${afterStar}`);
    }
    const { page: detailPage, data: detailData } = await pageData(
      '/pages/word-detail/word-detail?id=library',
      1800
    );
    const detailStar = await detailPage.$('.detail-head-top .star');
    check('词条详情页显示五角星', !!detailStar, detailStar ? '已找到' : '缺失');
    if (detailStar) {
      const before = !!detailData.starred;
      await detailStar.tap();
      await sleep(400);
      const after = (await detailPage.data()).starred;
      check('详情页五角星点击切换收藏状态', after === !before, `${before} → ${after}`);
    }
  } catch (error) {
    check('本轮修复回归（执行异常）', false, error.message);
  } finally {
    if (beforeAppData) await mp.callWxMethod('setStorageSync', STORAGE_KEY, beforeAppData);
    else await mp.callWxMethod('removeStorageSync', STORAGE_KEY);
  }
}

// 11. 极速刷词完成页：把本轮「不认识」的词汇聚成新的一轮单独学习
{
  const { page: rushFinish, data: rushBase } = await pageData(
    '/pages/wordbook-rush/wordbook-rush?id=default',
    2000
  );
  const words = rushBase.words ?? [];
  if (!words.length) {
    check('极速刷词收敛轮（前置条件）', false, '默认生词本无可刷词');
  } else {
    const roundWords = words.slice(0, 2);
    await rushFinish.setData({
      words: roundWords,
      originalWords: roundWords,
      total: roundWords.length,
      index: 0,
      current: roundWords[0],
      known: 0,
      unknown: 0,
      unknownWords: [],
      isUnknownRound: false,
      finished: false,
      loading: false,
      empty: false
    });
    await sleep(300);

    // 真实点击「不认识」→ 收集该词；再点「认识」结束本轮
    const noBtn = await rushFinish.$('.rush-actions .btn-ghost');
    if (noBtn) {
      await noBtn.tap();
      await sleep(300);
    }
    const afterNo = await rushFinish.data();
    check('点「不认识」会收集该词', (afterNo.unknownWords ?? []).length === 1,
      `unknownWords=${afterNo.unknownWords?.length}`);
    const yesBtn = await rushFinish.$('.rush-actions .wb-primary');
    if (yesBtn) {
      await yesBtn.tap();
      await sleep(300);
    }
    const done = await rushFinish.data();
    check('本轮结束进入完成页', done.finished === true, `finished=${done.finished}`);

    const unknownBtn = await rushFinish.$('.result-actions .wb-outline');
    check('完成页新增「只刷不认识的词」按钮', !!unknownBtn, unknownBtn ? '已找到' : '缺失');
    if (unknownBtn && typeof unknownBtn.text === 'function') {
      const label = await unknownBtn.text();
      check('按钮显示本轮不认识的词数', label.includes('1'), label);
    }
    if (unknownBtn) {
      await unknownBtn.tap();
      await sleep(400);
      const after = await rushFinish.data();
      check('点击后单独学习不认识的词',
        after.finished === false && after.total === 1 && after.words?.length === 1 && after.isUnknownRound === true,
        `total=${after.total} words=${after.words?.length} isUnknownRound=${after.isUnknownRound}`);
      check('收敛轮重新收集自己的不认识词', (after.unknownWords ?? []).length === 0,
        `unknownWords=${after.unknownWords?.length}`);
    }

    // 「再刷一轮」回到首次加载的完整词表并退出收敛轮
    await rushFinish.setData({ finished: true });
    await sleep(200);
    const restartBtn = await rushFinish.$('.result-actions .wb-primary');
    if (restartBtn) {
      await restartBtn.tap();
      await sleep(300);
      const afterRestart = await rushFinish.data();
      check('再刷一轮回到完整词表',
        afterRestart.total === roundWords.length && afterRestart.isUnknownRound === false && afterRestart.finished === false,
        `total=${afterRestart.total} isUnknownRound=${afterRestart.isUnknownRound}`);
    }
  }
}

// 12. 点词弹卡：只有命中 7298 词库的词可点；卡内展开、加词、发音、无 AI 搜索
// 注意：miniprogram-automator 的 page.$$ 不穿透自定义组件（glass-easel），
// 因此结构用页面 wxml() 断言、交互用 getElementByXpath（单数版，复数版当前工具不支持）。
{
  const { page } = await pageData('/pages/word-detail/word-detail?id=library', 2200);
  const root = await page.$('.page');
  const wxml = async () => String(await root.wxml());
  const before = await wxml();
  const tapMarkup = before.match(/<text[^>]*class="wt-token is-tap[^>]*>/g) || [];
  const plainMarkup = before.match(/<text[^>]*class="wt-token"[^>]*>/g) || [];
  check('词卡文本切成可点 token（例句/义项/搭配/词族等）', tapMarkup.length > 0, `${tapMarkup.length} 处`);
  check('未收录词渲染为普通文本', plainMarkup.length > 0, `${plainMarkup.length} 处`);
  check('可点 token 均携带词条 id', tapMarkup.length > 0 && tapMarkup.every((m) => m.includes('data-id=')));
  check('未命中 token 不携带点击数据', plainMarkup.length > 0 && plainMarkup.every((m) => !m.includes('data-id=')));

  const first = await page.getElementByXpath('//*[contains(@class,"wt-token is-tap")]');
  check('XPath 可取到可点词节点', !!first);
  if (first) {
    await first.tap();
    await sleep(900);
    const opened = await wxml();
    const card = opened.slice(opened.indexOf('wp-card'));
    check('点击命中词弹出点词卡片', opened.includes('wp-card') && card.includes('wp-word'));
    check('弹卡含英美两个发音入口', (card.match(/class="wp-ph"/g) || []).length >= 2);
    check('弹卡含星标与加入生词本按钮', card.includes('wp-star') && card.includes('wp-add'));
    check('弹卡不做问 AI 搜索', !card.includes('wp-ai') && !card.includes('<input') && !card.includes('问AI'));

    const detailBtn = await page.getElementByXpath('//*[@class="wp-detail-btn"]');
    if (detailBtn) await detailBtn.tap();
    await sleep(1700);
    const expanded = await wxml();
    const detailLabel = await page.getElementByXpath('//*[contains(@class,"wp-detail-btn")]');
    check('「详细释义」卡内展开全部义项且不跳页',
      (expanded.match(/class="wp-sense"/g) || []).length > 0
        && (await page.data()).word?.id === 'library'
        && (detailLabel ? String(await detailLabel.text()).includes('收起') : false));

    // 加词点两次回到原状态，避免污染 AppData / 影响后续用例
    const add1 = await page.getElementByXpath('//*[contains(@class,"wp-add")]');
    if (add1) {
      const labelBefore = String(await add1.text()).trim();
      await add1.tap();
      await sleep(600);
      const add2 = await page.getElementByXpath('//*[contains(@class,"wp-add")]');
      const labelAfter = add2 ? String(await add2.text()).trim() : '';
      check('加入生词本按钮切换状态', !!labelAfter && labelAfter !== labelBefore, `${labelBefore} → ${labelAfter}`);
      if (add2) {
        await add2.tap();
        await sleep(500);
      }
      const add3 = await page.getElementByXpath('//*[contains(@class,"wp-add")]');
      check('再次点击恢复原收藏状态（不污染 AppData）',
        !!add3 && String(await add3.text()).trim() === labelBefore);
    }

    const mask = await page.getElementByXpath('//*[@class="wp-mask"]');
    if (mask) await mask.trigger('tap');
    await sleep(600);
    check('点击遮罩关闭弹卡', !(await wxml()).includes('wp-card'));
  }
}

// 13. 今日单词小测：首页常驻入口 + 学习完成页入口 + 复用极速刷词 + 完成页三按钮 + 返回首页
{
  // 制造一条今日学习记录（写 AppData），分组末尾恢复 storage 避免污染真实状态
  const storageBefore = await mp.callWxMethod('getStorageSync', STORAGE_KEY);
  const studyForQuiz = await mp.reLaunch('/pages/study/study');
  await sleep(2200);
  const studyState = await studyForQuiz.data();
  if (studyState.current && !studyState.finished && !studyState.rated && !studyState.loading) {
    // 走真实按钮点击（callMethod 直调页面方法在小程序运行时会丢失 this）
    const knownBtn = await studyForQuiz.$('.rate-btn.is-known');
    if (knownBtn) {
      await knownBtn.tap();
      await sleep(500);
    }
  }

  const { page: homePage, data: homeData } = await pageData('/pages/home/home', 1500);
  const homeWxml = String(await (await homePage.$('.page')).wxml());
  check('首页有独立的「单词小测」入口卡片', homeWxml.includes('quiz-panel') && homeWxml.includes('今日单词小测'));
  check('首页展示今日已学词数', typeof homeData.quizCount === 'number' && homeData.quizCount >= 0,
    `quizCount=${homeData.quizCount}`);

  const quizBtn = await homePage.$('.quiz-btn');
  check('首页小测按钮存在且绑定入口', !!quizBtn, `quizCount=${homeData.quizCount}`);
  if (quizBtn && homeData.quizCount > 0) {
    await quizBtn.tap();
    await sleep(2000);
    const quizPage = await mp.currentPage();
    const quizData = quizPage ? await quizPage.data() : {};
    check('点击入口进入今日单词小测（复用极速刷词）',
      quizData.source === 'today' && !!quizData.current && quizData.backLabel === '返回首页',
      `source=${quizData.source} word=${quizData.current?.word} back=${quizData.backLabel}`);
    check('小测词来自今日学习记录且出词卡', (quizData.total ?? 0) > 0 && !quizData.empty,
      `total=${quizData.total} empty=${quizData.empty}`);

    if (quizPage) {
      await quizPage.setData({
        finished: true,
        known: Math.max(0, (quizData.total ?? 1) - 1),
        unknown: Math.min(1, quizData.total ?? 1),
        unknownWords: (quizData.words ?? []).slice(0, 1)
      });
      await sleep(400);
      const resultRoot = await quizPage.$('.page');
      const resultWxml = resultRoot ? String(await resultRoot.wxml()) : '';
      check('完成页标题为「本轮小测完成」', resultWxml.includes('本轮小测完成'));
      check('完成页三个按钮：再刷一轮 / 本轮生词 / 返回首页',
        resultWxml.includes('再刷一轮') && resultWxml.includes('本轮生词') && resultWxml.includes('返回首页'));
      check('完成页不再显示「返回词表」', !resultWxml.includes('返回词表'));

      const backBtn = await quizPage.$('.result-actions .btn-ghost');
      if (backBtn) {
        await backBtn.tap();
        await sleep(900);
      }
      const afterBack = await mp.currentPage();
      check('点「返回首页」回到学习 tab', !!afterBack && String(afterBack.path ?? '').includes('pages/home/home'),
        afterBack ? afterBack.path : 'no page');
    }
  }

  // 学习完成页入口（仅普通学习来源展示）
  const finishPage = await mp.reLaunch('/pages/study/study');
  await sleep(1800);
  await finishPage.setData({ finished: true, loading: false, empty: false, wordbookId: '' });
  await sleep(300);
  const finishRoot = await finishPage.$('.page');
  const finishWxml = finishRoot ? String(await finishRoot.wxml()) : '';
  check('学习完成页有「今日单词小测」入口', finishWxml.includes('今日单词小测'));

  if (storageBefore) await mp.callWxMethod('setStorageSync', STORAGE_KEY, storageBefore);
  else await mp.callWxMethod('removeStorageSync', STORAGE_KEY);
}

// 14. 短文记词：栏目目录 / 分组 / 重点词标注 / 三开关 / 词条卡 / 组内翻页 / 进度入口
{
  const { page: listPage, data: listData } = await pageData('/pages/passage-list/passage-list', 1500);
  check('短文目录默认展示 40 篇雅思短文',
    listData.group === 'ielts-passage' && listData.total === 40 && (listData.list || []).length === 40,
    `group=${listData.group} total=${listData.total}`);
  const listRoot = await listPage.$('.page');
  const listWxml = listRoot ? String(await listRoot.wxml()) : '';
  check('目录项含中英标题与重点词数',
    listWxml.includes('item-kw') && listWxml.includes('A Journey across Canada'));

  const segs = (await listPage.$$('.seg')) || [];
  if (segs.length >= 2) {
    await segs[1].tap();
    await sleep(400);
    const storyData = await listPage.data();
    check('切到双语小故事分组展示 27 篇',
      storyData.group === 'bilingual-story' && storyData.total === 27,
      `group=${storyData.group} total=${storyData.total}`);
    const segsBack = (await listPage.$$('.seg')) || [];
    if (segsBack.length) await segsBack[0].tap();
    await sleep(300);
  }

  const items = (await listPage.$$('.item')) || [];
  if (items.length) {
    await items[0].tap();
    await sleep(1300);
  }
  const detail = await mp.currentPage();
  const detailData = detail ? await detail.data() : {};
  const detailRoot = detail ? await detail.$('.page') : null;
  const dWxml = detailRoot ? String(await detailRoot.wxml()) : '';
  check('点击目录进入详情页并加载正文分段',
    !!detail && String(detail.path ?? '').includes('passage-detail') && (detailData.segments || []).length > 0,
    `path=${detail?.path} segments=${detailData.segments?.length}`);
  check('中文译文默认隐藏', detailData.showZh === false && !dWxml.includes('article-zh'));
  check('重点词默认高亮且渲染分段',
    detailData.showKw === true && (detailData.keywords || []).length > 0 && dWxml.includes('kw-gloss'),
    `keywords=${detailData.keywords?.length}`);
  check('内联词注默认隐藏', detailData.showGloss === false && dWxml.includes('is-hidden'));

  const chips = (await detail.$$('.chip')) || [];
  check('详情页有三个显示开关', chips.length === 3, `chips=${chips.length}`);
  // setData 后节点引用可能失效，每次重新取
  const tapChip = async (index) => {
    const list = (await detail.$$('.chip')) || [];
    if (list[index]) await list[index].tap();
    await sleep(350);
  };
  if (chips.length >= 1) {
    await tapChip(0);
    const zhState = await detail.data();
    const zhRoot = await detail.$('.page');
    const zhWxml = zhRoot ? String(await zhRoot.wxml()) : '';
    check('「显示中文」展开中文译文', zhState.showZh === true && zhWxml.includes('article-zh'));
  }
  if (chips.length >= 2) {
    await tapChip(1);
    const glossState = await detail.data();
    const glossRoot = await detail.$('.page');
    const glossWxml = glossRoot ? String(await glossRoot.wxml()) : '';
    check('「显示词注」展开内联释义',
      glossState.showGloss === true && !glossWxml.includes('kw-gloss is-hidden'));
  }

  const kwEl = await detail.$('.kw');
  if (kwEl) {
    await kwEl.tap();
    await sleep(400);
  }
  const modalState = await detail.data();
  check('点击重点词弹出词条卡（含词典义项）',
    !!modalState.activeKw && typeof modalState.activeKw.w === 'string' && (modalState.activeKw.senses || []).length > 0,
    `word=${modalState.activeKw?.w}`);
  const closeBtn = await detail.$('.kw-card-close');
  if (closeBtn) await closeBtn.tap();
  await sleep(300);

  if (chips.length >= 3) {
    await tapChip(2);
    const kwOffState = await detail.data();
    check('「重点词」开关可关闭高亮', kwOffState.showKw === false);
  }

  const pagerBtns = (await detail.$$('.pager-btn')) || [];
  check('详情页有上一篇/下一篇按钮', pagerBtns.length === 2);
  if (pagerBtns.length >= 2) {
    await pagerBtns[1].tap();
    await sleep(1300);
    const nextPage = await mp.currentPage();
    const nextData = nextPage ? await nextPage.data() : {};
    check('「下一篇」在同一分组内翻到 p002', nextData.id === 'p002', `id=${nextData.id}`);
  }

  const { page: settingsPage } = await pageData('/pages/settings/settings', 1200);
  const settingsRoot = await settingsPage.$('.page');
  const settingsWxml = settingsRoot ? String(await settingsRoot.wxml()) : '';
  check('「我的」页保留「查看话题进度」入口', settingsWxml.includes('查看话题进度'));
}

// 15. 生词本左滑删除：左滑露出删除按钮 → 二次警告 → 取消保留 / 确认删除
{
  const storageBefore = await mp.callWxMethod('getStorageSync', STORAGE_KEY);
  const { page, data } = await pageData('/pages/wordbook/wordbook', 1400);
  const root = await page.$('.page');
  const wxml = root ? String(await root.wxml()) : '';
  check('生词本卡片带左滑容器与删除按钮',
    wxml.includes('book-swipe') && wxml.includes('book-delete'));

  const deletable = (data.books || []).filter((book) => book.id !== 'default');
  const delNodes = (await page.$$('.book-delete')) || [];
  check('固定本不显示删除按钮', delNodes.length === deletable.length,
    `删除按钮 ${delNodes.length} / 可删本 ${deletable.length}`);
  check('存在可删除的非固定生词本', deletable.length > 0, `本数 ${(data.books || []).length}`);

  if (deletable.length) {
    const target = deletable[deletable.length - 1];
    await page.setData({ swipedId: target.id });
    await sleep(400);
    const swipedRoot = await page.$('.page');
    const swipedWxml = swipedRoot ? String(await swipedRoot.wxml()) : '';
    const swipedState = await page.data();
    check('左滑后展开删除态（卡片位移）',
      swipedState.swipedId === target.id,
      `swipedId=${swipedState.swipedId} · ${swipedWxml.includes('translateX') ? 'transform 已渲染' : 'wxml 未含 transform'}`);
    if (process.env.E2E_SCREENSHOT) {
      await mp.screenshot({ path: process.env.E2E_SCREENSHOT.replace(/\.png$/, '-wordbook-swipe.png') });
    }

    const tapDelete = async () => {
      const nodes = (await page.$$('.book-delete')) || [];
      const btn = nodes[nodes.length - 1];
      if (btn) await btn.trigger('tap');
    };

    await mp.mockWxMethod('showModal', { confirm: false, cancel: true });
    await tapDelete();
    await sleep(600);
    const afterCancel = await page.data();
    check('点删除弹出警告，取消时保留生词本',
      (afterCancel.books || []).some((book) => book.id === target.id),
      `本数 ${(afterCancel.books || []).length}`);

    await page.setData({ swipedId: target.id });
    await sleep(300);
    await mp.mockWxMethod('showModal', { confirm: true, cancel: false });
    await tapDelete();
    await sleep(700);
    const afterConfirm = await page.data();
    check('确认警告后删除生词本',
      !(afterConfirm.books || []).some((book) => book.id === target.id),
      `剩余本数 ${(afterConfirm.books || []).length}`);
  }

  if (storageBefore) await mp.callWxMethod('setStorageSync', STORAGE_KEY, storageBefore);
  else await mp.callWxMethod('removeStorageSync', STORAGE_KEY);
}

// console 诊断汇总
const repoLogs = consoleLogs.filter((l) => l.includes('[word-repo]'));
const moduleErrors = consoleLogs.filter((l) => l.includes('is not defined'));
console.log('\n[word-repo] 日志:');
repoLogs.forEach((l) => console.log('  ' + l));
check('无 "module not defined" 报错', moduleErrors.length === 0, moduleErrors.join(' | ') || 'clean');

// 可选视觉证据：设置 E2E_SCREENSHOT 时在单次连接内截详情页，避免二次 launch 连接失败
if (process.env.E2E_SCREENSHOT) {
  const shot = (name) => process.env.E2E_SCREENSHOT.replace(/\.png$/, `-${name}.png`);
  const saved = [process.env.E2E_SCREENSHOT];

  const detail = await mp.reLaunch('/pages/word-detail/word-detail?id=library');
  await sleep(2000);
  await mp.screenshot({ path: process.env.E2E_SCREENSHOT });
  // 滚动视图：核对释义区顺序与详情页三枚并排按钮
  await mp.pageScrollTo(1100);
  await sleep(1000);
  await mp.screenshot({ path: shot('scroll') });
  saved.push(shot('scroll'));

  // 播放/按下态：把第一个音频组件置为 playing，稳定截取腰形高亮
  try {
    const audioEls = await detail.$$('.audio-segment');
    console.log('音频组件节点数:', audioEls.length);
    if (audioEls.length) {
      await audioEls[0].setData({ status: 'playing' });
      await sleep(500);
      await mp.screenshot({ path: shot('pressed') });
      saved.push(shot('pressed'));
      await audioEls[0].setData({ status: 'idle' });
    }
  } catch (error) {
    console.log('按下态截图跳过:', error.message);
  }

  // 学习页已评分态：仅 setData 模拟，不点击评分、不写 storage
  const study = await mp.reLaunch('/pages/study/study');
  await sleep(2000);
  await study.setData({ rated: true, showMeaning: true, loading: false, finished: false, empty: false });
  await sleep(600);
  await mp.screenshot({ path: shot('study') });
  saved.push(shot('study'));
  // 学习页词卡很长，滚到底部核对音频组与并排的动作按钮
  await mp.pageScrollTo(3000);
  await sleep(800);
  await mp.screenshot({ path: shot('study-bottom') });
  saved.push(shot('study-bottom'));

  // 练习页单发音按钮：确认分组改造未影响 tone="dark" 的独立胶囊
  const practice = await mp.reLaunch('/pages/practice/practice?ids=library');
  await sleep(2000);
  const practiceData = await practice.data();
  if (practiceData.current && !practiceData.current.audioUrl) {
    await practice.setData({ current: { ...practiceData.current, audioUrl: 'https://example.invalid/preview.mp3' } });
    await sleep(400);
  }
  await mp.screenshot({ path: shot('practice') });
  saved.push(shot('practice'));

  // 生词本首页与词表页（含四分类、遮挡条、浮动工具条）
  await mp.reLaunch('/pages/wordbook/wordbook');
  await sleep(1200);
  await mp.screenshot({ path: shot('wordbook') });
  saved.push(shot('wordbook'));
  const wbListPage = await mp.reLaunch('/pages/wordbook-list/wordbook-list?id=default');
  await sleep(1500);
  // 截图展示默认的「遮挡释义」态（功能断言已在第 9 组验证，这里只还原视觉）
  if (wbListPage) await wbListPage.setData({ maskMode: 'meaning' });
  await sleep(300);
  await mp.screenshot({ path: shot('wordbook-list') });
  saved.push(shot('wordbook-list'));

  // 极速刷词：展开后的完整释义
  const rushShot = await mp.reLaunch('/pages/wordbook-rush/wordbook-rush?id=default');
  await sleep(1800);
  if (rushShot) await rushShot.setData({ showMeaning: true, loading: false, empty: false, finished: false });
  await sleep(400);
  await mp.screenshot({ path: shot('wordbook-rush') });
  saved.push(shot('wordbook-rush'));

  // 完成页：三个按钮（含「只刷不认识的词」）
  const rushFinishData = await rushShot.data();
  await rushShot.setData({
    finished: true,
    known: Math.max(0, (rushFinishData.total ?? 1) - 1),
    unknown: Math.min(1, rushFinishData.total ?? 1),
    unknownWords: (rushFinishData.words ?? []).slice(0, 1),
    loading: false,
    empty: false
  });
  await sleep(300);
  await mp.screenshot({ path: shot('wordbook-rush-finish') });
  saved.push(shot('wordbook-rush-finish'));

  // 词库列表五角星
  await mp.reLaunch('/pages/library/library');
  await sleep(1200);
  await mp.screenshot({ path: shot('library-star') });
  saved.push(shot('library-star'));

  // 名称弹层（输入框高度）
  const wbDialog = await mp.reLaunch('/pages/wordbook/wordbook');
  await sleep(1000);
  const editForShot = (await wbDialog.$$('.edit-btn')) || [];
  if (editForShot.length) await editForShot[0].tap();
  await sleep(300);
  await mp.screenshot({ path: shot('wordbook-dialog') });
  saved.push(shot('wordbook-dialog'));

  // 生词本来源的学习完成页（返回生词本文案）
  const finishShot = await mp.reLaunch('/pages/study/study?wordbook=default');
  await sleep(1800);
  if (finishShot) await finishShot.setData({ finished: true, loading: false, empty: false });
  await sleep(300);
  await mp.screenshot({ path: shot('study-finish') });
  saved.push(shot('study-finish'));

  // 复习页（存在到期词时才截）
  const review = await mp.reLaunch('/pages/review/review');
  await sleep(1500);
  const reviewData = await review.data();
  if (reviewData.current) {
    await mp.screenshot({ path: shot('review') });
    saved.push(shot('review'));
    // 复习页滚到底部：核对三音频分段居中与快捷评分按钮顺序
    await mp.pageScrollTo(3000);
    await sleep(800);
    await mp.screenshot({ path: shot('review-bottom') });
    saved.push(shot('review-bottom'));
  }

  // 短文记词：目录 / 详情默认态 / 中文与词注展开态
  await mp.reLaunch('/pages/passage-list/passage-list');
  await sleep(1200);
  await mp.screenshot({ path: shot('passage-list') });
  saved.push(shot('passage-list'));

  // from=list 让三个开关回到默认，确保截图展示真正的默认态
  const passageDetailShot = await mp.reLaunch('/pages/passage-detail/passage-detail?id=p001&from=list');
  await sleep(1400);
  await mp.screenshot({ path: shot('passage-detail') });
  saved.push(shot('passage-detail'));
  if (passageDetailShot) {
    await passageDetailShot.setData({ showZh: true, showGloss: true, showKw: true });
    await sleep(500);
    await mp.screenshot({ path: shot('passage-gloss') });
    saved.push(shot('passage-gloss'));
    await mp.pageScrollTo(4000);
    await sleep(600);
    await mp.screenshot({ path: shot('passage-zh') });
    saved.push(shot('passage-zh'));
  }

  // 点词弹卡视觉证据：放在最后，避免遮罩影响前面所有截图
  const tapShotPage = await mp.reLaunch('/pages/word-detail/word-detail?id=library');
  await sleep(1800);
  const tapEl = await tapShotPage.getElementByXpath('//*[contains(@class,"wt-token is-tap")]');
  if (tapEl) {
    await tapEl.tap();
    await sleep(800);
  }
  await mp.screenshot({ path: shot('word-tap') });
  saved.push(shot('word-tap'));

  // 首页「单词小测」入口与今日小测完成页
  const homeShot = await mp.reLaunch('/pages/home/home');
  await sleep(1200);
  await mp.screenshot({ path: shot('home-quiz') });
  saved.push(shot('home-quiz'));

  const quizShot = await mp.reLaunch('/pages/wordbook-rush/wordbook-rush?source=today');
  await sleep(1800);
  const quizShotData = await quizShot.data();
  await quizShot.setData({
    finished: true,
    loading: false,
    empty: false,
    known: Math.max(0, (quizShotData.total ?? 1) - 1),
    unknown: Math.min(1, quizShotData.total ?? 1),
    unknownWords: (quizShotData.words ?? []).slice(0, 1)
  });
  await sleep(300);
  await mp.screenshot({ path: shot('daily-quiz-finish') });
  saved.push(shot('daily-quiz-finish'));

  console.log(`截图已保存: ${saved.join(' / ')}`);
}

// 恢复两个首次使用引导的原始标记，保证 E2E 不改变真实使用状态
if (hintBefore) await mp.callWxMethod('setStorageSync', HINT_KEY, hintBefore);
else await mp.callWxMethod('removeStorageSync', HINT_KEY);
if (detailHintBefore) await mp.callWxMethod('setStorageSync', DETAIL_HINT_KEY, detailHintBefore);
else await mp.callWxMethod('removeStorageSync', DETAIL_HINT_KEY);

// 恢复为 E2E 临时调大的每日新词设置
if (dailyRestoreTo !== null) {
  const restore = await mp.reLaunch('/pages/settings/settings');
  await sleep(1000);
  const tags = (await restore.$$('.tag')) || [];
  for (const tag of tags) {
    if (Number(await tag.attribute('data-value')) === dailyRestoreTo) {
      await tag.tap();
      break;
    }
  }
}

await mp.disconnect();

const failed = results.filter((r) => !r.pass);
console.log(`\n${failed.length === 0 ? 'E2E_ALL_PASSED' : 'E2E_FAILED: ' + failed.map((f) => f.name).join(', ')}`);
process.exit(failed.length === 0 ? 0 : 1);
