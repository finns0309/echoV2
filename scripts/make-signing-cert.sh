#!/bin/bash
# One-time: create a self-signed code-signing identity for Echo.
#
# Why: macOS binds the Input Monitoring grant (for the ⌥ + right ⌘ hotkey) to the
# app's code signature. Ad-hoc signatures pin a cdhash that changes on every build,
# so the grant silently stops matching. Signing with a fixed certificate turns the
# designated requirement into "com.finn.echo + this cert", which survives rebuilds.
#
# The identity lives in its own keychain file — the login keychain and system trust
# settings are left untouched, and no admin password is needed. `pnpm package` picks
# it up automatically (scripts/sign.cjs).
set -euo pipefail

NAME="Echo Local Signing"
KEYCHAIN="$HOME/Library/Keychains/echo-signing.keychain-db"
# Only guards a self-signed dev cert on this machine.
KC_PASS="echo-signing"

if [[ -f "$KEYCHAIN" ]] && security find-certificate -c "$NAME" "$KEYCHAIN" >/dev/null 2>&1; then
  echo "already exists: \"$NAME\" in $KEYCHAIN"
  exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/cert.cnf" <<EOF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = $NAME
[ext]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
EOF

openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -keyout "$TMP/key.pem" -out "$TMP/cert.pem" -config "$TMP/cert.cnf" 2>/dev/null
# -legacy: Apple's `security import` can't read OpenSSL 3's default PKCS#12 ciphers.
LEGACY=""
openssl pkcs12 -help 2>&1 | grep -q -- "-legacy" && LEGACY="-legacy"
openssl pkcs12 -export $LEGACY -inkey "$TMP/key.pem" -in "$TMP/cert.pem" \
  -name "$NAME" -out "$TMP/id.p12" -passout pass:echo

rm -f "$KEYCHAIN"
security create-keychain -p "$KC_PASS" "$KEYCHAIN"
security set-keychain-settings "$KEYCHAIN"   # no auto-lock timeout
security unlock-keychain -p "$KC_PASS" "$KEYCHAIN"
security import "$TMP/id.p12" -k "$KEYCHAIN" -P echo -T /usr/bin/codesign >/dev/null
# Let codesign use the key without a GUI "allow access" prompt.
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KC_PASS" "$KEYCHAIN" >/dev/null

echo "created \"$NAME\" in $KEYCHAIN"
