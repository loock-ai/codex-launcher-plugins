#!/usr/bin/env python3
"""Add bounded Dot voice foreground execution to the pinned Pake project."""
import argparse
from pathlib import Path
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser()
parser.add_argument('--project', type=Path, required=True)
parser.add_argument('--templates', type=Path, required=True)
args = parser.parse_args()
source = args.project / 'app/src/main/java/com/app/pakeplus'
activity = source / 'MainActivity.kt'
text = activity.read_text()
marker = '// codex-voice-background: generated integration'

def replace_once(old, new):
    global text
    if text.count(old) != 1:
        raise SystemExit(f'Pinned MainActivity anchor mismatch: {old!r}')
    text = text.replace(old, new, 1)

if marker not in text:
    replace_once('private lateinit var webView: WebView', 'private lateinit var webView: WebView\n' + (args.templates / 'MainActivityVoice.kt.inc').read_text())
    replace_once('// 判断是不是安卓客户端', (args.templates / 'JsBridgeVoice.kt.inc').read_text() + '\n        // 判断是不是安卓客户端')
    replace_once('super.onPause()', 'super.onPause()\n        voiceActivityResumed = false')
    # Scope lifecycle changes; the inserted helper also calls onPause.
    start = text.index('override fun onPause()')
    end = text.index('override fun onResume()', start)
    pause = text[start:end]
    if pause.count('webView.onPause()') != 1 or pause.count('webView.pauseTimers()') != 1:
        raise SystemExit('Pinned MainActivity pause lifecycle mismatch')
    pause = pause.replace('webView.onPause()', 'if (voiceSessionId == null) webView.onPause()').replace('webView.pauseTimers()', 'if (voiceSessionId == null) webView.pauseTimers()')
    text = text[:start] + pause + text[end:]
    replace_once('super.onResume()', 'super.onResume()\n        voiceActivityResumed = true')
    replace_once('webView.destroy()', 'voiceDestroyed = true\n        voiceSessionId?.let { stopVoiceBackground(it) }\n        if (voiceBackgroundListener != null && VoiceBackgroundService.listener === voiceBackgroundListener) VoiceBackgroundService.listener = null\n        voiceBackgroundListener = null\n        webView.destroy()')

android = 'http://schemas.android.com/apk/res/android'
ET.register_namespace('android', android)
manifest = args.project / 'app/src/main/AndroidManifest.xml'
tree = ET.parse(manifest)
root = tree.getroot()
application = root.find('application')
if application is None:
    raise SystemExit('Missing Android application')
for name in ['FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_MICROPHONE', 'WAKE_LOCK', 'POST_NOTIFICATIONS']:
    value = 'android.permission.' + name
    if not any(p.get(f'{{{android}}}name') == value for p in root.findall('uses-permission')):
        root.insert(0, ET.Element('uses-permission', {f'{{{android}}}name': value}))
service_name = 'com.app.pakeplus.VoiceBackgroundService'
services = [s for s in application.findall('service') if s.get(f'{{{android}}}name') == service_name]
if len(services) > 1:
    raise SystemExit('Duplicate voice service')
service = services[0] if services else ET.SubElement(application, 'service')
service.set(f'{{{android}}}name', service_name)
service.set(f'{{{android}}}exported', 'false')
service.set(f'{{{android}}}foregroundServiceType', 'microphone')
activity.write_text(text)
for filename in ['VoiceSessionLease.kt', 'VoiceBackgroundService.kt']:
    (source / filename).write_text((args.templates / filename).read_text())
tests = args.project / 'app/src/test/java/com/app/pakeplus'
tests.mkdir(parents=True, exist_ok=True)
(tests / 'VoiceSessionLeaseTest.kt').write_text((args.templates / 'VoiceSessionLeaseTest.kt').read_text())
tree.write(manifest, encoding='unicode', xml_declaration=True)
