FROM alpine:3.20
RUN apk add --no-cache bash curl
COPY setup.sh /setup.sh
RUN chmod +x /setup.sh
ENTRYPOINT ["/setup.sh"]
