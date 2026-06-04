docker run --rm -it --network nova_net --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit 200 --memory="2g" --cpus="2.0" --tmpfs /tmp -v nova_state:/home/nova nova-safe bash

//ollama
// with network
docker run -d --name ollama --gpus all --network nova_bridge -v ollama_state:/root/.ollama ollama/ollama

// without network
docker run -d --name ollama --gpus all --network nova_net -v ollama_state:/root/.ollama ollama/ollama


$env:NOVA_GATEWAY_TOKEN="<set-a-long-random-token>"


docker run --rm -it --network nova_net -v nova_dev_state:/home/nova/.nova-dev -e NOVA_GATEWAY_URL=ws://nova-gw:19001 -e NOVA_GATEWAY_TOKEN=$env:NOVA_GATEWAY_TOKEN nova-safe nova --dev cron add --name "autonomy-loop" --schedule "*/2 * * * *" --session-id autonomy --message "Write the current timestamp into /home/nova/.nova-dev/canvas/autonomy.log and append to it. Do not use external tools." --json


docker run --rm -it --network nova_net -v nova_dev_state:/home/nova/.nova-dev -e NOVA_GATEWAY_URL=ws://nova-gw:19001 -e NOVA_GATEWAY_TOKEN=$env:NOVA_GATEWAY_TOKEN nova-safe nova --dev cron add --name autonomy-loop --every 2m --session isolated --message "Append the current timestamp to canvas/autonomy.log. Do not use external tools." --json

docker run --rm --user 0 -v nova_dev_state:/state alpine sh -lc "chown -R 1001:1001 /state"

docker run -d --name nova-gw --network nova_net -v nova_dev_state:/home/nova/.nova-dev -e NOVA_GATEWAY_TOKEN=$env:NOVA_GATEWAY_TOKEN nova-safe nova --dev gateway --allow-unconfigured --bind lan --port 19001

// qdrant for observer retrieval
docker compose up -d qdrant

// host observer env
$env:QDRANT_URL="http://127.0.0.1:6333"
cd nova-observer
node server.js
