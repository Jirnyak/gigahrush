import urllib.request, json, os, socket, ssl, struct, base64, time

def get_itch_tab():
    req = urllib.request.urlopen("http://127.0.0.1:9222/json")
    tabs = json.loads(req.read().decode())
    for t in tabs:
        if "itch.io/game/edit/4587160" in t.get("url", ""):
            return t
    for t in tabs:
        if "itch.io" in t.get("url", ""):
            return t
    return None

class SimpleWS:
    def __init__(self, ws_url):
        # ws://127.0.0.1:9222/devtools/page/UUID
        path = "/" + ws_url.split("/", 3)[3]
        self.sock = socket.create_connection(("127.0.0.1", 9222), timeout=10)
        
        # Handshake
        key = base64.b64encode(os.urandom(16)).decode()
        req = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: 127.0.0.1:9222\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(req.encode())
        resp = self.sock.recv(4096).decode()
        if "101" not in resp:
            raise Exception("WebSocket handshake failed: " + resp)
        self.msg_id = 1

    def send_frame(self, data_str):
        payload = data_str.encode('utf-8')
        length = len(payload)
        mask = os.urandom(4)
        
        header = bytearray([0x81]) # FIN + Text
        if length <= 125:
            header.append(0x80 | length)
        elif length <= 65535:
            header.append(0x80 | 126)
            header.extend(struct.pack("!H", length))
        else:
            header.append(0x80 | 127)
            header.extend(struct.pack("!Q", length))
            
        header.extend(mask)
        masked_payload = bytearray(b ^ mask[i % 4] for i, b in enumerate(payload))
        self.sock.sendall(header + masked_payload)

    def recv_frame(self):
        head = self.sock.recv(2)
        if not head or len(head) < 2:
            return None
        b1, b2 = head[0], head[1]
        length = b2 & 0x7F
        if length == 126:
            length = struct.unpack("!H", self.sock.recv(2))[0]
        elif length == 127:
            length = struct.unpack("!Q", self.sock.recv(8))[0]
            
        data = bytearray()
        while len(data) < length:
            chunk = self.sock.recv(min(length - len(data), 65536))
            if not chunk: break
            data.extend(chunk)
        return data.decode('utf-8', errors='ignore')

    def call(self, method, params=None):
        mid = self.msg_id
        self.msg_id += 1
        payload = {"id": mid, "method": method, "params": params or {}}
        self.send_frame(json.dumps(payload))
        while True:
            raw = self.recv_frame()
            if not raw:
                raise Exception("Socket closed")
            try:
                msg = json.loads(raw)
                if msg.get("id") == mid:
                    return msg
            except json.JSONDecodeError:
                pass

    def close(self):
        self.sock.close()

def main():
    tab = get_itch_tab()
    if not tab:
        print("No itch tab found!")
        return
    print(f"Targeting: {tab['title']} -> {tab['url']}")
    
    ws = SimpleWS(tab['webSocketDebuggerUrl'])
    print("Connected to WebSocket successfully!")
    
    # 1. Enable Runtime
    ws.call("Runtime.enable")
    
    # 2. Read images and description
    upload_dir = "/Users/jirnyak/Mirror/gigahrush/screenshots/itch_upload"
    files = sorted([f for f in os.listdir(upload_dir) if not f.startswith('.')])
    
    file_payloads = []
    for f in files:
        fpath = os.path.join(upload_dir, f)
        if os.path.getsize(fpath) > 5 * 1024 * 1024:
            continue
        mime = "image/gif" if f.endswith(".gif") else "image/png"
        with open(fpath, "rb") as img_f:
            b64 = base64.b64encode(img_f.read()).decode('ascii')
            file_payloads.append({"name": f, "mime": mime, "b64": b64})
            
    print(f"Loaded {len(file_payloads)} images.")
    
    with open("/Users/jirnyak/Mirror/gigahrush/PRCampaign/itch_description_updated_2026.html", "r", encoding="utf-8") as html_f:
        updated_html = html_f.read()
        
    # 3. Inject description, delete old screenshots, upload new screenshots, and save
    print("Executing in-browser deletion, upload, description update, and save...")
    js_code = f"""
    (async () => {{
      const html = {json.dumps(updated_html)};
      const images = {json.dumps(file_payloads)};
      const csrf = document.querySelector('input[name="csrf_token"]')?.value;
      const gameId = document.querySelector('input[name="game_id"]')?.value || "4587160";

      // 1. Delete old screenshots
      const oldBtns = [...document.querySelectorAll('.delete_screen_btn')];
      oldBtns.forEach(b => b.click());

      // 2. Update Description
      document.querySelectorAll('textarea[name="game[description]"]').forEach(t => {{
        t.value = html;
        t.dispatchEvent(new Event('input', {{ bubbles: true }}));
        t.dispatchEvent(new Event('change', {{ bubbles: true }}));
      }});
      document.querySelectorAll('.redactor-in, .redactor-editor').forEach(r => {{
        r.innerHTML = html;
        r.dispatchEvent(new Event('input', {{ bubbles: true }}));
        r.dispatchEvent(new Event('change', {{ bubbles: true }}));
      }});

      // 3. Upload new screenshots sequentially
      const uploadResults = [];
      for (let i = 0; i < images.length; i++) {{
        const img = images[i];
        try {{
          const byteChars = atob(img.b64);
          const byteNums = new Array(byteChars.length);
          for (let j = 0; j < byteChars.length; j++) byteNums[j] = byteChars.charCodeAt(j);
          const byteArray = new Uint8Array(byteNums);
          const blob = new Blob([byteArray], {{ type: img.mime }});

          const fd = new FormData();
          fd.append('csrf_token', csrf);
          fd.append('upload_type', 'screenshot');
          fd.append('game_id', gameId);
          fd.append('file', blob, img.name);

          const res = await fetch('/upload-image', {{ method: 'POST', body: fd }});
          const json = await res.json();
          uploadResults.push({{ name: img.name, ok: true, id: json.id }});

          if (json && json.id) {{
            const hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.name = 'screenshot[' + json.id + '][position]';
            hidden.className = 'screenshot_position_input';
            hidden.value = String(i);
            document.querySelector('form.edit_game_form, form')?.appendChild(hidden);
          }}
        }} catch(e) {{
          uploadResults.push({{ name: img.name, ok: false, error: String(e) }});
        }}
      }}

      // 4. Click Save
      setTimeout(() => {{
        const saveBtn = document.querySelector('button.save_btn, .save_btn');
        if (saveBtn) saveBtn.click();
      }}, 1000);

      return {{
        deletedCount: oldBtns.length,
        descUpdated: true,
        uploads: uploadResults
      }};
    }})()
    """
    
    res = ws.call("Runtime.evaluate", {
        "expression": js_code,
        "awaitPromise": True,
        "returnByValue": True
    })
    
    print("Execution Result:", json.dumps(res.get("result", {}).get("result", {}).get("value"), indent=2))
    
    # Wait for save
    time.sleep(5)
    
    # Navigate to public page and verify
    print("Navigating to https://tenevik.itch.io/gigahrush...")
    ws.call("Runtime.evaluate", {
        "expression": 'window.location.href = "https://tenevik.itch.io/gigahrush";'
    })
    time.sleep(4)
    
    # Re-check public page
    ws.close()
    
    tab2 = get_itch_tab()
    if tab2:
        ws2 = SimpleWS(tab2['webSocketDebuggerUrl'])
        ws2.call("Runtime.enable")
        verify = ws2.call("Runtime.evaluate", {
            "expression": '''
            (() => {
              const rateLink = document.querySelector('a[href*="tenevik.itch.io/gigahrush/rate"]');
              const oldRateLink = document.querySelector('a[href*="itch.io/game/rate/4587160"]');
              const screens = [...document.querySelectorAll('.screenshot_list img, .right_col img')].map(i => i.src);
              return {
                title: document.title,
                hasNewRateLink: !!rateLink,
                hasOldRateLink: !!oldRateLink,
                rateLinkHref: rateLink ? rateLink.href : null,
                screenshotsCount: screens.length,
                screens: screens
              };
            })()
            ''',
            "returnByValue": True
        })
        print("FINAL VERIFICATION:", json.dumps(verify.get("result", {}).get("result", {}).get("value"), indent=2))
        ws2.close()

if __name__ == "__main__":
    main()
