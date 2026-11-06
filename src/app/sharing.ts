import { MAX_SHARE_URL_LENGTH } from '../config/limits.ts';
import type { Session } from './session.ts';
import { exportNotebook, importNotebook } from './notebook-document.ts';

const prefix = '#notebook=';
export function createShareUrl(session: Session, base: string): string {
  const bytes = new TextEncoder().encode(exportNotebook(session, false));
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  const url = new URL(base); url.hash = prefix.slice(1) + btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  if (url.href.length > MAX_SHARE_URL_LENGTH) throw new Error('共有URLが長すぎます。JSON保存をご利用ください。');
  return url.href;
}
export function readShareHash(hash: string): Session | null {
  if (!hash.startsWith(prefix)) return null;
  if (hash.length > MAX_SHARE_URL_LENGTH) throw new Error('共有URLが長すぎます。JSONファイルで読み込んでください。');
  const encoded = hash.slice(prefix.length);
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) throw new Error('共有URLのデータが不正です。');
  let text: string;
  try {
    const binary = atob(encoded.replaceAll('-', '+').replaceAll('_', '/'));
    text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  } catch { throw new Error('共有URLの文字コード・形式が不正です。'); }
  return importNotebook(text);
}
