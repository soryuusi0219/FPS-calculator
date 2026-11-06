#!/usr/bin/env bash
# Linux/macOS用。システム設定を変更せず、Git管理外の.local/nodeへ配置する。
set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
node_major="$(tr -d '[:space:]' < "$project_root/.nvmrc")"
if [[ ! "$node_major" =~ ^[0-9]+$ ]]; then
  echo '.nvmrc にはNode.jsのメジャーバージョンを指定してください。' >&2
  exit 1
fi
destination="$project_root/.local/node"
if [[ -x "$destination/bin/node" ]] && [[ "$("$destination/bin/node" --version)" == v"$node_major".* ]]; then
  echo "導入済み: $("$destination/bin/node" --version) ($destination)"
  exit 0
fi
if [[ -e "$destination" || -L "$destination" ]]; then
  echo "$destination が既に存在します。既存ファイルを上書きせず停止しました。" >&2
  exit 1
fi

case "$(uname -s)" in
  Linux) platform=linux ;;
  Darwin) platform=darwin ;;
  *) echo 'このスクリプトはLinux/macOS用です。Node.js 24以上を導入してください。' >&2; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64|amd64) architecture=x64 ;;
  arm64|aarch64) architecture=arm64 ;;
  *) echo '対応アーキテクチャはx64/arm64です。' >&2; exit 1 ;;
esac

download() {
  if command -v curl >/dev/null 2>&1; then
    curl --proto '=https' --tlsv1.2 -fsSL --retry 2 --connect-timeout 15 --max-time 180 "$1" -o "$2"
  else
    wget --https-only --timeout=180 -q "$1" -O "$2"
  fi
}
if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
  echo 'curl または wget が必要です。' >&2; exit 1
fi
if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then
  echo 'sha256sum または shasum が必要です。' >&2; exit 1
fi

mkdir -p "$project_root/.local"
temporary="$(mktemp -d "$project_root/.local/node-download.XXXXXX")"
trap 'rm -rf -- "$temporary"' EXIT
base_url="https://nodejs.org/dist/latest-v$node_major.x"
download "$base_url/SHASUMS256.txt" "$temporary/SHASUMS256.txt"
pattern="^node-v$node_major[.][0-9]+[.][0-9]+-$platform-$architecture[.]tar[.]xz$"
if ! read -r expected archive < <(awk -v pattern="$pattern" '$2 ~ pattern { print $1, $2 }' "$temporary/SHASUMS256.txt"); then
  echo 'Node.js公式配布一覧に対象のアーカイブがありません。' >&2; exit 1
fi
if [[ ! "$expected" =~ ^[a-f0-9]{64}$ || ! "$archive" =~ $pattern ]]; then
  echo 'Node.js公式配布一覧から対象のアーカイブを確認できませんでした。' >&2; exit 1
fi
echo "取得中: $archive"
download "$base_url/$archive" "$temporary/$archive"
if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "$temporary/$archive")"
else
  actual="$(shasum -a 256 "$temporary/$archive")"
fi
if [[ "${actual%% *}" != "$expected" ]]; then
  echo 'SHA-256が一致しないため、インストールを中止しました。' >&2; exit 1
fi
mkdir "$temporary/runtime"
tar -xf "$temporary/$archive" -C "$temporary/runtime" --strip-components=1
"$temporary/runtime/bin/node" --version
mv "$temporary/runtime" "$destination"
echo "配置しました: $destination"
echo 'npm run dev などのコマンドは、このNode.jsを自動的に利用できます。'
echo '依存を再インストールする場合: export PATH="$PWD/.local/node/bin:$PATH"; npm ci'
