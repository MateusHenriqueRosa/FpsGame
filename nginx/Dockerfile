FROM nginx:alpine

# Copiar configuração do nginx
COPY nginx/nginx.conf /etc/nginx/nginx.conf

# Copiar arquivos do frontend para servir
COPY frontend/ /usr/share/nginx/html/

# Expor portas
EXPOSE 80 443
