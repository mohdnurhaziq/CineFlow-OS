# CineFlow OS backups: SQLite online backup + a file mirror. See backup.sh.
FROM alpine:3.20
RUN apk add --no-cache sqlite rsync tzdata
COPY backup.sh /backup.sh
RUN chmod +x /backup.sh
ENTRYPOINT ["/backup.sh"]
CMD ["daemon"]
