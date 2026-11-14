/**
 * 词库媒体资源（插画/音频）的 URL 前缀。
 * 统一走微信云开发「静态网站托管」CDN（免备案、免小程序域名白名单、
 * 匿名可直链访问），媒体由 npm run upload:media 部署至静态托管 atlas/ 目录。
 * 注意：不能按 envVersion 区分本地/云端——真机调试/真机预览同为 develop 环境，
 * 本地 127.0.0.1 在手机上不可达，会导致图片与音频全部加载失败。
 */
const CDN = 'https://slogan-d2g7bvmyw4f8d901e-1527547939.tcloudbaseapp.com/atlas';

export interface MediaUrls {
  img: string;
  thumb: string;
  uk: string;
  us: string;
  ex: string;
}

/** 由词条 id 派生媒体 URL（上游 atlas 布局：img/thumb/{id}.webp、audio/{uk|us|ex}/{id}.mp3）。 */
export function mediaUrls(id: string): MediaUrls {
  return {
    img: `${CDN}/img/${id}.webp`,
    thumb: `${CDN}/thumb/${id}.webp`,
    uk: `${CDN}/audio/uk/${id}.mp3`,
    us: `${CDN}/audio/us/${id}.mp3`,
    ex: `${CDN}/audio/ex/${id}.mp3`
  };
}
