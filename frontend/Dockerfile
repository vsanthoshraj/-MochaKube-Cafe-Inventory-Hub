FROM nginx:1.31-alpine

RUN apk add --no-cache gettext

COPY . /usr/share/nginx/html/

COPY nginx.conf.template /etc/nginx/templates/nginx.conf.template

COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]