#!/usr/bin/env node
/* 他農場の GAS に入れる合言葉（TOKEN）を乱数で作る。標準出力だけ（ファイルには書かない）。
   出力を、農場の GAS のスクリプトプロパティ TOKEN と、ビルド時の環境変数 TENANT_GAS_TOKEN／非共有の控えにだけ貼る。
   24字（英数字・暗号論的乱数）。GAS は プロパティ由来で 16字未満だと全拒否する */
import crypto from 'node:crypto';
const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export function token(n) { let s = ''; while (s.length < n) { const b = crypto.randomBytes(1)[0]; if (b < 256 - (256 % A.length)) s += A[b % A.length]; } return s; }
if (process.argv[1] && process.argv[1].endsWith('gen-tokens.mjs')) console.log('TOKEN=' + token(24));
