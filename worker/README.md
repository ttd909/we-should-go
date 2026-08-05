# Self-hosted extraction worker

The extraction worker does not accept incoming internet traffic. It polls the
Supabase `extraction_jobs` queue and writes completed results back to Supabase.

## Windows setup

1. Install and start Docker Desktop.
2. In Docker Desktop, enable **Start Docker Desktop when you sign in**.
3. In Windows power settings, prevent the PC from sleeping while plugged in.
4. Create `worker/.env` from `worker/.env.example` and enter the same values
   currently configured in Railway. Never commit this file.
5. From the repository root, build and start the worker:

   ```powershell
   docker compose up -d --build
   ```

6. Confirm it is running:

   ```powershell
   docker compose ps
   docker compose logs --tail 50 extraction-worker
   ```

   The logs should contain `Worker started - polling every 5s when idle`.

7. Submit a test TikTok, Instagram, or Facebook reel in the app and follow the
   worker logs:

   ```powershell
   docker compose logs -f extraction-worker
   ```

   Press `Ctrl+C` to stop following logs. This does not stop the worker.

## Routine commands

```powershell
# Show status
docker compose ps

# Show recent logs
docker compose logs --tail 100 extraction-worker

# Restart the worker
docker compose restart extraction-worker

# Rebuild after pulling worker code changes
docker compose up -d --build

# Stop the worker without deleting its image
docker compose down
```

The container uses `restart: unless-stopped`, so Docker restarts it after a
crash or reboot. Docker Desktop must itself be running after Windows starts.

## Moving to a Mac mini

1. Install Docker Desktop for Apple Silicon.
2. Clone the repository.
3. Copy `worker/.env` to the Mac using a secure method. Do not send it through
   Git or ordinary messaging.
4. Run `docker compose up -d --build` from the repository root.
5. Process test reels and verify the logs before turning off the PC worker.

Only one worker is needed long-term. A short overlap is safe because Supabase
claims each extraction job atomically.

## Railway transition

Keep Railway running for the initial PC test. Once the PC worker has processed
several jobs successfully and survived a reboot, pause the Railway service for
one week. Delete or cancel Railway only after the PC worker has remained stable.

## Security

`worker/.env` contains a Supabase service-role key with elevated privileges.
Keep it private, do not add it to Git, and do not copy it into support messages
or logs. `.dockerignore` explicitly excludes the file from Docker builds.
