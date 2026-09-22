// echo-hotkey: watches modifier keys and prints "toggle" when ⌥ is held and the
// right ⌘ goes down (in either order). Electron can't tell left from right
// modifiers, hence this helper. Lines on stdout:
//   active            the event tap is running
//   needs-permission  Input Monitoring isn't granted yet; retrying
//   toggle            the chord was pressed
// It exits when its stdin closes, i.e. when echo goes away.
import CoreGraphics
import Foundation

setvbuf(stdout, nil, _IOLBF, 0)

let rightCommand: UInt64 = 0x10 // NX_DEVICERCMDKEYMASK: device-dependent bit for the right ⌘
var armed = true
var tap: CFMachPort?

let callback: CGEventTapCallBack = { _, type, event, _ in
  if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
    if let tap { CGEvent.tapEnable(tap: tap, enable: true) }
    return Unmanaged.passUnretained(event)
  }
  let flags = event.flags
  let chord = flags.contains(.maskAlternate) && (flags.rawValue & rightCommand) != 0
  if chord && armed {
    print("toggle")
    armed = false
  } else if !chord {
    armed = true
  }
  return Unmanaged.passUnretained(event)
}

func install() -> Bool {
  let mask = CGEventMask(1 << CGEventType.flagsChanged.rawValue)
  guard let created = CGEvent.tapCreate(
    tap: .cgSessionEventTap, place: .headInsertEventTap, options: .listenOnly,
    eventsOfInterest: mask, callback: callback, userInfo: nil)
  else { return false }
  tap = created
  let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, created, 0)
  CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
  CGEvent.tapEnable(tap: created, enable: true)
  print("active")
  return true
}

// Leave when echo does.
Thread.detachNewThread {
  while readLine() != nil {}
  exit(0)
}

if !CGPreflightListenEventAccess() { CGRequestListenEventAccess() }
if !install() {
  print("needs-permission")
  Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { timer in
    if install() { timer.invalidate() }
  }
}
CFRunLoopRun()
