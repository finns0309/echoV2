// electron-builder afterSign hook: re-sign Echo.app with the stable local identity
// from scripts/make-signing-cert.sh, so the Input Monitoring grant for the hotkey
// survives rebuilds (an ad-hoc signature changes with every build, and macOS then
// treats the app as new). Runs before the dmg is made. Without the identity it
// leaves electron-builder's ad-hoc signature and says so.
const { execFileSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { homedir } = require('node:os')
const { join } = require('node:path')

const NAME = 'Echo Local Signing'
const KEYCHAIN = join(homedir(), 'Library/Keychains/echo-signing.keychain-db')
const KC_PASS = 'echo-signing' // only guards a self-signed dev cert on this machine

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' })

/** The identity's SHA-1: codesign skips untrusted self-signed certs when matching by name. */
function identity() {
  if (!existsSync(KEYCHAIN)) return null
  const out = run('security', ['find-identity', '-p', 'codesigning', KEYCHAIN])
  const line = out.split('\n').find((l) => l.includes(`"${NAME}"`))
  return line?.match(/\b([0-9A-F]{40})\b/)?.[1] ?? null
}

exports.default = async function sign(context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const hash = identity()
  if (!hash) {
    console.warn(`  • ad-hoc signed: the hotkey's Input Monitoring grant resets on every build. Run scripts/make-signing-cert.sh once.`)
    return
  }

  run('security', ['unlock-keychain', '-p', KC_PASS, KEYCHAIN])
  // codesign only resolves identities from the user search list: add ours for the duration.
  const original = run('security', ['list-keychains', '-d', 'user'])
    .split('\n')
    .map((l) => l.trim().replace(/^"|"$/g, ''))
    .filter(Boolean)
  run('security', ['list-keychains', '-d', 'user', '-s', ...original, KEYCHAIN])
  try {
    // Inside out: the hotkey helper (it isn't in a place --deep looks), then everything else.
    const helper = join(app, 'Contents/Resources/echo-hotkey')
    if (existsSync(helper)) run('codesign', ['--force', '--sign', hash, '--identifier', 'com.finn.echo.hotkey', helper])
    run('codesign', ['--force', '--deep', '--sign', hash, app])
    run('codesign', ['--verify', '--deep', '--strict', app])
    console.log(`  • signed with "${NAME}": the hotkey grant survives rebuilds`)
  } finally {
    run('security', ['list-keychains', '-d', 'user', '-s', ...original])
  }
}
