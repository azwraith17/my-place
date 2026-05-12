# my-place

A personal space with a PDF/EPUB reader, highlights, and offline translation (English → Farsi).

## Deploying on Raspberry Pi

### Requirements

- Raspberry Pi OS Bookworm (64-bit recommended)
- Python 3.11+ — check with `python3 --version`
- git

### 1. Clone the repo

```bash
git clone <your-repo-url> ~/my-place
cd ~/my-place
```

### 2. Create a virtual environment and install dependencies

```bash
python3 -m venv venv
venv/bin/pip install -e reader-api/
```

### 3. Configure environment

```bash
cp .env.example .env
nano .env
```

Set these values in `.env`:

```env
READER_PASSWORD=choose-a-strong-password
COOKIE_SECRET=run-python3-secrets-token-hex-32-and-paste-here
LIBRARY_PATH=/home/pi/my-place/library
DATA_PATH=/home/pi/my-place/data
```

Generate a secret: `python3 -c "import secrets; print(secrets.token_hex(32))"`

### 4. Create data directories

```bash
mkdir -p ~/my-place/library ~/my-place/data
```

### 5. Install as a systemd service

```bash
sudo cp ~/my-place/deploy/my-place.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable my-place
sudo systemctl start my-place
```

Check it is running:

```bash
sudo systemctl status my-place
# live logs:
sudo journalctl -u my-place -f
```

The service starts on boot and restarts automatically on failure. It listens on **port 8000**.

Open `http://<pi-ip>:8000` in your browser on any device on the same network.

### Updating

```bash
cd ~/my-place
git pull
venv/bin/pip install -e reader-api/   # picks up any new dependencies
sudo systemctl restart my-place
```

### Translation (offline)

The first time you click **Translate** in the reader, the en→fa language model (~130 MB) is downloaded automatically. Every request after that works fully offline. The model is stored in `~/.local/share/argos-translate/`.

### Notes

- Books are stored in `LIBRARY_PATH` (one sub-directory per book).
- Highlights are written atomically to `highlights.json` inside each book directory — safe across power loss.
- Logs: `sudo journalctl -u my-place -f`
- Stop: `sudo systemctl stop my-place`
