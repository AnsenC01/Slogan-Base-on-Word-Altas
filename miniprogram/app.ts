import { readAppData, writeAppData } from './services/storage';

App({
  onLaunch() {
    // 首次启动时写入默认数据，保证后续读取结构完整。
    const data = readAppData();
    writeAppData(data);
  }
});
