set snippet to "fetch(\"http://127.0.0.1:8790/PRCampaign/itch_auto_apply.js\").then(r=>r.text()).then(eval)"
set the clipboard to snippet

tell application "Opera GX"
    activate
end tell

tell application "System Events"
    tell process "Opera"
        keystroke "allow pasting"
        delay 0.2
        key code 36
        delay 0.3
        keystroke "v" using {command down}
        delay 0.3
        key code 36
    end tell
end tell
