import { execFile } from 'node:child_process';
import type { MouseJiggle } from '../jiggle';
import { getLogger } from '../../logger';

const log = getLogger('jiggle-macos');

const JXA_MOUSE_JIGGLE = `
ObjC.import('CoreGraphics');
var ev = $.CGEventCreate(null);
var pt = $.CGEventGetLocation(ev);
var m1 = $.CGEventCreateMouseEvent(null, $.kCGEventMouseMoved, {x: pt.x + 1, y: pt.y}, 0);
$.CGEventPost($.kCGHIDEventTap, m1);
delay(0.05);
var m2 = $.CGEventCreateMouseEvent(null, $.kCGEventMouseMoved, pt, 0);
$.CGEventPost($.kCGHIDEventTap, m2);
`.trim();

export class MouseJiggleMacOS implements MouseJiggle {
  jiggle(): void {
    execFile('osascript', ['-l', 'JavaScript', '-e', JXA_MOUSE_JIGGLE], (err) => {
      if (err) log.error('mouse jiggle failed:', err);
    });
  }
}
