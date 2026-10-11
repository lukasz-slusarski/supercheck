#!/usr/bin/env bash
# Supercheck — środowisko ewaluacyjne w GitHub Codespaces
#
# Różnice względem wspieranej instalacji produkcyjnej (świadome, na czas testu):
#   - K3s działa jako k3d (klaster w kontenerach Dockera), bo Codespaces nie da
#     nam systemd ani własnego jądra
#   - gVisor wyłączony (EXECUTION_RUNTIME_CLASS_NAME=none) — brak /dev/kvm
#   - kubeconfig workera z insecure-skip-tls-verify, żeby nie walczyć z SAN-ami
#     certyfikatu k3d dla adresu host-gateway
#
# Uruchomienie w Codespace:
#   bash eval-codespace.sh

set -euo pipefail

CLUSTER=supercheck
EXEC_NS=supercheck-execution
WORKER_NS=supercheck-workers
KUBECONFIG_OUT="${HOME}/supercheck-worker.kubeconfig"
COMPOSE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/deploy/docker"

log() { echo -e "\033[0;32m[✓]\033[0m $*"; }
info() { echo -e "\033[0;34m[i]\033[0m $*"; }

# ─── 1. k3d ───────────────────────────────────────────────────────────────────

if ! command -v k3d &>/dev/null; then
  log "Instaluję k3d..."
  curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash
fi

if ! k3d cluster list 2>/dev/null | grep -q "^${CLUSTER}"; then
  log "Tworzę klaster ${CLUSTER} (API na 0.0.0.0:6443)..."
  k3d cluster create "$CLUSTER" \
    --api-port 0.0.0.0:6443 \
    --k3s-arg "--disable=traefik@server:*" \
    --k3s-arg "--disable=servicelb@server:*" \
    --k3s-arg "--disable=metrics-server@server:*" \
    --wait
else
  info "Klaster ${CLUSTER} już istnieje"
fi

kubectl cluster-info >/dev/null
log "Klaster odpowiada"

# ─── 2. Namespace wykonawczy i limity ────────────────────────────────────────

log "Tworzę namespace ${EXEC_NS} z limitami..."
kubectl apply -f - <<YAML
apiVersion: v1
kind: Namespace
metadata:
  name: ${EXEC_NS}
---
apiVersion: v1
kind: ResourceQuota
metadata:
  name: execution-limits
  namespace: ${EXEC_NS}
spec:
  hard:
    requests.cpu: "2"
    requests.memory: 4Gi
    limits.cpu: "3"
    limits.memory: 6Gi
    count/jobs.batch: "5"
    pods: "5"
---
apiVersion: v1
kind: LimitRange
metadata:
  name: execution-guardrails
  namespace: ${EXEC_NS}
spec:
  limits:
    - type: Container
      defaultRequest:
        cpu: 250m
        memory: 768Mi
      default:
        cpu: "1"
        memory: 2Gi
      max:
        cpu: "2"
        memory: 3Gi
YAML

# ─── 3. Konto serwisowe workera + RBAC ───────────────────────────────────────

log "Tworzę konto serwisowe workera i RBAC..."
kubectl apply -f - <<YAML
apiVersion: v1
kind: Namespace
metadata:
  name: ${WORKER_NS}
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: supercheck-worker
  namespace: ${WORKER_NS}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: execution-manager
  namespace: ${EXEC_NS}
rules:
  - apiGroups: ["batch"]
    resources: ["jobs"]
    verbs: ["create", "get", "list", "watch", "delete", "deletecollection"]
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch", "delete"]
  - apiGroups: [""]
    resources: ["pods/log"]
    verbs: ["get"]
  - apiGroups: [""]
    resources: ["pods/exec"]
    verbs: ["get", "create"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: worker-execution-manager
  namespace: ${EXEC_NS}
subjects:
  - kind: ServiceAccount
    name: supercheck-worker
    namespace: ${WORKER_NS}
roleRef:
  kind: Role
  name: execution-manager
  apiGroup: rbac.authorization.k8s.io
---
apiVersion: v1
kind: Secret
metadata:
  name: supercheck-worker-token
  namespace: ${WORKER_NS}
  annotations:
    kubernetes.io/service-account.name: supercheck-worker
type: kubernetes.io/service-account-token
YAML

info "Czekam na token konta serwisowego..."
TOKEN=""
for _ in $(seq 1 30); do
  TOKEN=$(kubectl get secret supercheck-worker-token -n "$WORKER_NS" -o jsonpath='{.data.token}' 2>/dev/null | base64 -d || true)
  [[ -n "$TOKEN" ]] && break
  sleep 1
done
[[ -z "$TOKEN" ]] && { echo "Nie udało się pobrać tokenu"; exit 1; }

# Worker (kontener Dockera) puka do API klastra przez bramę hosta.
cat > "$KUBECONFIG_OUT" <<EOF
apiVersion: v1
kind: Config
clusters:
  - name: supercheck
    cluster:
      server: https://host.docker.internal:6443
      insecure-skip-tls-verify: true
contexts:
  - name: worker@supercheck
    context:
      cluster: supercheck
      user: worker
      namespace: ${EXEC_NS}
current-context: worker@supercheck
users:
  - name: worker
    user:
      token: ${TOKEN}
EOF
chmod 0644 "$KUBECONFIG_OUT"
log "Kubeconfig workera: ${KUBECONFIG_OUT}"

# ─── 4. Sekrety i konfiguracja ───────────────────────────────────────────────

cd "$COMPOSE_DIR"

if [[ ! -f .env ]]; then
  log "Generuję sekrety..."
  bash init-secrets.sh
fi

# Adres publiczny Codespace — bez tego logowanie (BetterAuth) odbije użytkownika
if [[ -n "${CODESPACE_NAME:-}" ]]; then
  APP_URL="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
else
  APP_URL="http://localhost:3000"
fi

set_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${val}|" .env
  else
    echo "${key}=${val}" >> .env
  fi
}

set_env EXECUTION_RUNTIME_CLASS_NAME none   # brak gVisora — tylko ewaluacja
set_env NEXT_PUBLIC_APP_URL "$APP_URL"
set_env RUNNING_CAPACITY 1
set_env QUEUED_CAPACITY 5
set_env WORKER_LOCATION local

log "Adres aplikacji: ${APP_URL}"

# ─── 5. Start ─────────────────────────────────────────────────────────────────

log "Uruchamiam stack (pierwsze pobranie obrazów potrwa kilka minut)..."
KUBECONFIG_FILE="$KUBECONFIG_OUT" docker compose up -d

info "Czekam aż aplikacja odpowie..."
for i in $(seq 1 60); do
  if curl -fsS http://localhost:3000/api/health >/dev/null 2>&1; then
    log "Aplikacja odpowiada"
    break
  fi
  sleep 5
done

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "Gotowe"
echo "Panel:     ${APP_URL}"
echo "Kolejka:   docker compose logs -f worker"
echo "Klaster:   kubectl get jobs -n ${EXEC_NS} -w"
echo
echo "Sprzątanie: docker compose down -v && k3d cluster delete ${CLUSTER}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
