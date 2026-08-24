FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# No USER directive previously - the process ran as root with no reason to.
RUN useradd --no-create-home --shell /usr/sbin/nologin appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 5000

# Flask's own dev server (`python app.py`) is single-threaded and explicitly
# unsupported for production use - it can only serve one request at a time,
# so every other concurrent journal AI call queues up behind whichever one is
# already in flight. gunicorn with multiple workers is a real WSGI server.
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "4", "--timeout", "60", "app:app"]
