# Base image
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY app.py .

# Environment variable defaults (overridable in K8s Deployment)
ENV PORT=5000
ENV MYSQL_HOST=mysql-service
ENV MYSQL_PORT=3306
ENV MYSQL_USER=root
ENV MYSQL_PASSWORD=password
ENV MYSQL_DATABASE=cafe_db
ENV APP_ENV=Production

# Expose port
EXPOSE 5000

# Health check instructions for Docker daemon/orchestrator
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5000/healthz || exit 1

# Start the Flask app
CMD ["python", "app.py"]
