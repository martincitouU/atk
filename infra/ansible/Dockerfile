# Entorno Linux para correr Ansible. En macOS, la conexión por SSM hace que
# los procesos de Ansible se caigan ("Python se cerró inesperadamente"):
# macOS no permite que un proceso creado con fork use DNS ni el proxy del
# sistema. En Linux esa restricción no existe. Se usa con ./run.sh.

FROM python:3.13-slim

# Plugin de Session Manager para Linux (el binario que abre las sesiones SSM)
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
 && if [ "$TARGETARCH" = "arm64" ]; then SMP=ubuntu_arm64; else SMP=ubuntu_64bit; fi \
 && curl -fsSL "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/$SMP/session-manager-plugin.deb" -o /tmp/smp.deb \
 && dpkg -i /tmp/smp.deb && rm /tmp/smp.deb \
 && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "ansible-core~=2.21.0" boto3

COPY requirements.yml /tmp/requirements.yml
RUN ansible-galaxy collection install -r /tmp/requirements.yml -p /usr/share/ansible/collections
