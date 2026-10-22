// ステージの目標の秒数の計算（自動プレイを何回も回す）を、画面を止めないよう裏で行う
import { getStage } from './stages';

self.onmessage = (e: MessageEvent<number>) => {
  self.postMessage(getStage(e.data));
};
