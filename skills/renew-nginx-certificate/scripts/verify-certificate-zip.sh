#!/usr/bin/env bash
set -euo pipefail

zip_path=${1:?Usage: verify-certificate-zip.sh <certificate.zip>}
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/gufeifei-cert.XXXXXX")
trap 'rm -rf "$work_dir"' EXIT

unzip -q "$zip_path" -d "$work_dir"
cert=$(find "$work_dir" -type f -name 'gufeifei.cn_bundle.pem' -print -quit)
crt=$(find "$work_dir" -type f -name 'gufeifei.cn_bundle.crt' -print -quit)
csr=$(find "$work_dir" -type f -name 'gufeifei.cn.csr' -print -quit)
key=$(find "$work_dir" -type f -name 'gufeifei.cn.key' -print -quit)

for file in "$cert" "$crt" "$csr" "$key"; do
  test -n "$file" && test -f "$file" || { echo "Missing required certificate file" >&2; exit 1; }
done

openssl x509 -in "$cert" -noout -checkend 0 >/dev/null
openssl x509 -in "$cert" -noout -checkhost gufeifei.cn >/dev/null

cert_hash=$(openssl x509 -in "$cert" -pubkey -noout | openssl pkey -pubin -outform pem | shasum -a 256 | awk '{print $1}')
csr_hash=$(openssl req -in "$csr" -pubkey -noout | openssl pkey -pubin -outform pem | shasum -a 256 | awk '{print $1}')
key_hash=$(openssl pkey -in "$key" -pubout -outform pem | shasum -a 256 | awk '{print $1}')

test "$cert_hash" = "$csr_hash" && test "$cert_hash" = "$key_hash" || {
  echo "Certificate, CSR, and private key do not match" >&2
  exit 1
}

cmp -s "$cert" "$crt" || { echo "PEM and CRT bundles differ" >&2; exit 1; }
openssl x509 -in "$cert" -noout -subject -issuer -dates
echo "Certificate ZIP verified: hostname, validity, and key pair match."
