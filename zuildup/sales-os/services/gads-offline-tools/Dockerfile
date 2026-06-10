FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY upload_conversions.py reconcile_gclids.py ./

# Entry point picks the script based on ENTRYPOINT_SCRIPT env var.
# Cloud Run Jobs override this with their own command.
ENV ENTRYPOINT_SCRIPT=upload_conversions.py
CMD ["sh", "-c", "python $ENTRYPOINT_SCRIPT"]
