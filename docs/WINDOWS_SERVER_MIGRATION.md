# Comprehensive Windows Server Migration Guide (Desh-IT Dash Signage System)

This guide provides end-to-end instructions to migrate the **Digital Signage Dashboard ("Desh-IT Dash")** from a development/local environment (running Docker Desktop) to a production **Windows Server PC** using 100% free, open-source container tools, database migration workflows, reverse proxy configurations, and display client re-pairing.

---

## 1. System Architecture: Production Deployment

When migrated, the entire stack runs within a lightweight **WSL 2** environment on your Windows Server. Public requests are managed by an **NGINX Reverse Proxy** that terminates SSL (HTTPS/WSS) and routes traffic to the correct containers:

```
                  ┌──────────────────────────────────────────────┐
                  │                 INTERNET                     │
                  └──────────────────────┬───────────────────────┘
                                         │ HTTPS / WSS (Port 443)
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │         Windows Server Firewall / Router     │
                  └──────────────────────┬───────────────────────┘
                                         │
                                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          WINDOWS SERVER PC                             │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │              NGINX Reverse Proxy (SSL Gateway)                 │   │
│   └──────────────────────────────┬─────────────────────────────────┘   │
│                                  │ http / ws                           │
│                                  ▼                                     │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                 WSL 2 (Ubuntu Engine - Free)                   │   │
│   │                                                                │   │
│   │   ┌───────────────┐  ┌───────────────┐  ┌──────────────────┐   │   │
│   │   │  Portainer CE │  │  Web CMS App  │  │  Backend API     │   │   │
│   │   │   (Port 9000) │  │  (Port 3000)  │  │  (Port 3001)     │   │   │
│   │   └───────────────┘  └───────────────┘  └────────┬─────────┘   │   │
│   │                                                  │                 │   │
│   │                                                  ▼                 │   │
│   │   ┌───────────────┐  ┌───────────────┐  ┌──────────────────┐   │   │
│   │   │  Redis Cache  │  │  MinIO S3     │  │  PostgreSQL DB   │   │   │
│   │   │   (Port 6379) │  │  (Port 9000)  │  │  (Port 5432)     │   │   │
│   │   └───────────────┘  └───────────────┘  └──────────────────┘   │   │
│   └────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                     Windows PowerShell Core                    │   │
│   └────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Server Infrastructure Setup (WSL 2 & Docker CE)

To run the Linux-based containers for free, we install WSL 2 and the community edition of Docker.

### 2.1 Enable WSL 2
1. Open **PowerShell** as **Administrator** and run:
   ```powershell
   wsl --install
   ```
2. **Restart the Server** when prompted.
3. Once rebooted, install Ubuntu:
   ```powershell
   wsl --install -d Ubuntu
   ```
4. Enter a username and password when prompted by the Ubuntu terminal (e.g. `admin` / `Password123`).

### 2.2 Install Docker Engine (Community Edition)
Run these commands in Windows PowerShell to configure Docker inside WSL:
```powershell
# 1. Download Docker Setup Script
wsl curl -fsSL https://get.docker.com -o get-docker.sh

# 2. Run the Script as root
wsl sudo sh get-docker.sh

# 3. Add your WSL user to the docker group (replaces 'yourusername' with your WSL user)
wsl sudo usermod -aG docker admin

# 4. Start the Service
wsl sudo service docker start
```

### 2.3 Configure Windows PowerShell Integration
Add helper functions to your Windows PowerShell Profile so you can execute `docker` and `docker-compose` commands directly in Windows:
1. Open your profile:
   ```powershell
   if (!(Test-Path $PROFILE)) { New-Item -Type File -Path $PROFILE -Force }
   notepad $PROFILE
   ```
2. Paste the following functions and save:
   ```powershell
   function docker { wsl docker $args }
   function docker-compose { wsl docker compose $args }
   ```
3. Reload profile:
   ```powershell
   . $PROFILE
   ```

---

## 3. Database Migration (PostgreSQL)

You need to migrate your database schema, admin users, and layout settings from your local development PostgreSQL container to the production database container on the Windows Server.

### 3.1 Export Database from Dev Machine
On your development computer, run this command to export the PostgreSQL data:
```bash
docker exec -t digital-signage-postgres-1 pg_dump -U postgres -d digital_signage > db_backup.sql
```
*(Verify your container name using `docker ps` if the database container has a different suffix).*

### 3.2 Import Database on Windows Server
1. Copy `db_backup.sql` to your Windows Server (e.g., to `D:\Backup\db_backup.sql`).
2. Once you start your Docker stack on the Windows Server (see Section 6), restore the database:
   ```powershell
   # Inject the sql backup file directly into the production container
   docker exec -i postgres-container-name psql -U postgres -d digital_signage < D:\Backup\db_backup.sql
   ```

---

## 4. Media Storage Migration (MinIO / S3)

Your digital signage videos and images are stored inside the MinIO S3 container. We need to copy them to the Windows Server.

### 4.1 Copying Files Directly
If your Docker Compose mounts local volumes to the filesystem (e.g., `uploads/` folder or named volume paths):
1. Locate the dev media files on your local drive (usually in the `backend/uploads/` directory).
2. Copy the entire folder content to the target directory on your Windows Server.

### 4.2 Syncing via MinIO Client (For Named Volumes)
If you are using Docker Named Volumes (`minio_data`):
1. Download **MinIO Client (mc)** on your machine.
2. Alias your local development MinIO:
   ```bash
   mc alias set dev_minio http://localhost:9000 minioadmin minioadmin
   ```
3. Alias your new Windows Server MinIO:
   ```bash
   mc alias set prod_minio http://[server-ip]:9000 minioadmin minioadmin
   ```
4. Mirror the buckets:
   ```bash
   mc mirror dev_minio/digital-signage-media prod_minio/digital-signage-media
   ```

---

## 5. Reverse Proxy & SSL Setup (NGINX)

> [!IMPORTANT]
> The Android TV app, web player, and admin panel require secure connections (`https` and `wss`). Insecure requests (`http` / `ws`) will be blocked by browsers or OS security policies.

### 5.1 NGINX Configuration File
You can run NGINX inside a Docker container or natively on Windows. Here is the configuration to map public domains to the container ports:

Create a file named `nginx.conf`:
```nginx
events { worker_connections 1024; }

http {
    include       mime.types;
    default_type  application/octet-stream;

    # Redirect all HTTP traffic to HTTPS
    server {
        listen 80;
        server_name signage.yourdomain.com;
        return 301 https://$host$request_uri;
    }

    # HTTPS Server Configuration
    server {
        listen 443 ssl;
        server_name signage.yourdomain.com;

        # SSL Certificates (Create or buy certificates)
        ssl_certificate /etc/nginx/certs/fullchain.pem;
        ssl_certificate_key /etc/nginx/certs/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;

        # 1. Route Web CMS Admin Panel
        location / {
            proxy_pass http://localhost:3000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # 2. Route Backend API
        location /api {
            proxy_pass http://localhost:3001;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # 3. Route Socket.io WebSockets
        location /socket.io/ {
            proxy_pass http://localhost:3001/socket.io/;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "Upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # 4. Route TV Web Player
        location /tv {
            proxy_pass http://localhost:3002;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # 5. Route MinIO S3 Storage
        location /digital-signage-media {
            proxy_pass http://localhost:9000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }
}
```

### 5.2 Obtain SSL Certificates via Let's Encrypt (Windows Server Native)
1. Download **Certify the Web** or **Win-ACME** (free Windows Let's Encrypt clients).
2. Request a certificate for your domain (e.g., `signage.yourdomain.com`).
3. Configure the client to save/export the certificate files as `.pem` format into a folder (e.g., `C:\nginx\certs`).
4. Mount this folder into your NGINX container.

---

## 6. Configuring and Running the Stack

### 6.1 Set Environment Variables (`.env`)
Create a production `.env` file in your project directory on the Windows Server:
```env
JWT_SECRET="generate-a-secure-random-key"
PORT=3001

# Public URLs routing through the NGINX SSL reverse proxy
API_URL=https://signage.yourdomain.com/api
S3_PUBLIC_ENDPOINT=https://signage.yourdomain.com

# S3 Configuration
S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=adminaccesskey
S3_SECRET_ACCESS_KEY=adminsecretkey
S3_BUCKET_NAME=digital-signage-media
S3_FORCE_PATH_STYLE=true
```

### 6.2 Running the Application
From Windows PowerShell inside your project folder:
```powershell
docker-compose up -d
```

### 6.3 Setup Portainer Web GUI
1. Deploy Portainer:
   ```powershell
   docker volume create portainer_data
   docker run -d -p 9000:9000 --name portainer --restart always -v /var/run/docker.sock:/var/run/docker.sock -v portainer_data:/data portainer/portainer-ce:latest
   ```
2. Access `http://localhost:9000`, configure your administrator password, and monitor all running containers.

---

## 7. Display Client Re-configuration

Once the server IP or domain changes, you must update the TV display clients to pull content from the new location.

### 7.1 Web TV Player
If you are using the browser-based TV Player:
*   Direct your smart TV web browser to the new URL:
    `https://signage.yourdomain.com/tv`
*   Re-enter the **Device ID** when prompted to pair it.

### 7.2 Native Android TV App (Kotlin)
If you are using the Native Kotlin App on Android TV boxes or tablets:
1. Open the application on the device.
2. Press the **Settings / Reset** button on your remote control (or click the Settings overlay).
3. Select **Reset Configuration** to clear cached pairing tokens.
4. Input the new server domain/URL:
   `https://signage.yourdomain.com/api`
5. The device will generate a new pairing request; approve it in the Web CMS under the **Devices** tab.

---

## 8. Automating Boot Startup

On Windows Server, you want the services running even if no user logs in. Use **Task Scheduler** to trigger a script on boot.

1. Save the following PowerShell code in `C:\Scripts\startup.ps1`:
   ```powershell
   # Wait for Network Interface to be ready
   Start-Sleep -Seconds 10

   # Start WSL Docker service
   wsl -u root service docker start

   # Start Portainer
   wsl docker start portainer

   # Start signage stack
   wsl docker compose -f "/mnt/d/AI Project/Digital Dashboard/docker-compose.yml" up -d
   ```
2. Open **Task Scheduler** -> **Create Task** (Run with highest privileges, Run whether user is logged on or not, trigger: At Startup, action: `powershell.exe -ExecutionPolicy Bypass -File C:\Scripts\startup.ps1`).
