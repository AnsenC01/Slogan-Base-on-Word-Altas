export type AudioStatus = 'idle' | 'loading' | 'playing' | 'error';

export interface AudioState {
  url: string;
  status: AudioStatus;
}

type Listener = (state: AudioState) => void;

let context: WechatMiniprogram.InnerAudioContext | null = null;
let currentUrl = '';
let state: AudioState = { url: '', status: 'idle' };
const listeners = new Set<Listener>();

function emit(status: AudioStatus): void {
  state = { url: currentUrl, status };
  listeners.forEach((listener) => listener(state));
}

/** 全应用复用同一个 InnerAudioContext。 */
function ensureContext(): WechatMiniprogram.InnerAudioContext {
  if (context) return context;
  context = wx.createInnerAudioContext();
  // 真机（尤其 iOS）静音键拨到静音时不影响发音播放
  context.obeyMuteSwitch = false;
  // 开发版真机未开调试时，未配置域名会加载失败；输出便于在 vConsole 定位
  context.onError((error) => {
    console.warn('[audio] 播放失败', currentUrl, error);
    // 出错后清空当前 URL，下次点击会重新设置 src（避免一直复用失败的音频）
    currentUrl = '';
    emit('error');
  });
  context.onWaiting(() => emit('loading'));
  context.onCanplay(() => {
    if (state.status === 'loading') emit('playing');
  });
  context.onPlay(() => emit('playing'));
  context.onEnded(() => emit('idle'));
  context.onStop(() => emit('idle'));
  return context;
}

/**
 * 播放音频。
 * 关键：iOS 真机上 InnerAudioContext 播放结束（onEnded）后，对同一个 src 直接
 * 再调 play() 经常静默失败；因此每次点击都先 stop() 复位进度并重新赋 src，
 * 保证「极速刷词 / 词表喇叭」等重复点同一个词时也能出声。
 */
export function playAudio(url: string): void {
  if (!url) return;
  const audio = ensureContext();
  audio.stop();
  currentUrl = url;
  audio.src = url;
  emit('loading');
  audio.play();
}

export function stopAudio(): void {
  if (!context) return;
  context.stop();
  emit('idle');
}

export function getAudioState(): AudioState {
  return state;
}

export function subscribeAudio(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}
