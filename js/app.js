// script.js

// --- 1. VARIÁVEIS GLOBAIS E CONFIGURAÇÕES ---
let map = null;
let allGeojsonData = null; // Armazena o GeoJSON original
let currentLayer = null;   // A camada Leaflet atualmente visível
let filteredFeatures = []; // Features filtradas pelo núcleo/risco

const DEFAULT_CENTER = [-15.78, -47.92]; // Centro de Brasília
const DEFAULT_ZOOM = 4;

// Definições de Cores e Níveis de Risco (Grau 1 a 4)
const RISK_GRADES = {
    1: { color: '#28a745', name: 'Grau 1 (Risco Baixo)', toggle: true },  // Verde
    2: { color: '#ffc107', name: 'Grau 2 (Risco Moderado)', toggle: true }, // Amarelo
    3: { color: '#fd7e14', name: 'Grau 3 (Risco Elevado)', toggle: true }, // Laranja
    4: { color: '#dc3545', name: 'Grau 4 (Risco Crítico)', toggle: true },  // Vermelho
    'NA': { color: '#6c757d', name: 'Sem Risco Atribuído', toggle: true } // Cinza
};

// --- 2. CONFIGURAÇÃO BÁSICA DO MAPA ---
function initializeMap() {
    if (map) map.remove(); 
    
    map = L.map('map').setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    // OpenStreetMap - Camada base
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    // Nota: Para Google Satellite ou Earth, seria necessário usar a API ou um plugin Leaflet compatível, 
    // mas o OpenStreetMap garante a funcionalidade imediata sem chave de API.
}

// --- 3. GESTÃO DE TABS ---
function openTab(evt, tabName) {
    document.querySelectorAll(".tab-content").forEach(el => el.classList.add('hidden'));
    document.querySelectorAll(".tab-button").forEach(el => el.classList.remove('active'));

    document.getElementById(tabName).classList.remove('hidden');
    evt.currentTarget.classList.add('active');
}

// --- 4. LÓGICA DE GEOGRAFIA (Estilo e Conversão) ---

// Função principal de estilo, aplicando a lógica de risco (Grau)
function getFeatureStyle(feature) {
    const riskGrade = feature.properties.GRAU_RISCO || 'NA'; // Assume a propriedade GRAU_RISCO
    const colorData = RISK_GRADES[riskGrade] || RISK_GRADES['NA'];

    return {
        fillColor: colorData.color,
        color: colorData.color,
        weight: 1,
        opacity: 0.8,
        fillOpacity: 0.6
    };
}

// Adiciona Popups e Binds
function onEachFeature(feature, layer) {
    let popupContent = "<strong>Dados do Lote/Feição:</strong><br>";
    if (feature.properties) {
        for (const key in feature.properties) {
            // Exibe propriedades relevantes (limita a quantidade)
            if (feature.properties.hasOwnProperty(key) && key.length < 20 && key.toUpperCase() !== 'ID') {
                 // Formata o custo para exibição no popup
                let value = feature.properties[key];
                if (key.toUpperCase() === 'CUSTO') {
                     value = `R$ ${parseFloat(value).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
                }
                popupContent += `<b>${key}:</b> ${value}<br>`;
            }
        }
    }
    layer.bindPopup(popupContent);
}

// Converte coordenadas UTM para WGS84
function convertUtmToWgs84(easting, northing, utmZone) {
    const zoneNum = utmZone.slice(0, -1);
    const projDef = `+proj=utm +zone=${zoneNum} +${utmZone.endsWith('s') ? 'south' : 'north'} +ellps=GRS80 +units=m +no_defs`;
    
    const utm = proj4.defs('UTM', projDef);
    const wgs84 = proj4.defs('WGS84');
    
    return proj4(utm, wgs84, [easting, northing]); // Retorna [longitude, latitude]
}

// Aplica a transformação UTM em todas as coordenadas
function transformUtm(geojsonData, sigasZone) {
    const utmZone = sigasZone;
    function transformCoordinates(coords) {
        if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
            return coords.map(transformCoordinates);
        } else if (coords.length >= 2 && typeof coords[0] === 'number') {
            const [easting, northing] = coords;
            const [longitude, latitude] = convertUtmToWgs84(easting, northing, utmZone);
            return [longitude, latitude];
        }
        return coords;
    }

    if (geojsonData.type === 'FeatureCollection') {
        geojsonData.features = geojsonData.features.map(feature => {
            if (feature.geometry && feature.geometry.coordinates) {
                feature.geometry.coordinates = transformCoordinates(feature.geometry.coordinates);
            }
            return feature;
        });
    }
    return geojsonData;
}


// --- 5. FUNCIONALIDADES DE UPLOAD E MAPA ---

function handleFileUpload() {
    const fileInput = document.getElementById('geojson-file');
    const statusDiv = document.getElementById('upload-status');
    const sigasZone = document.getElementById('sigas-select').value;
    
    if (fileInput.files.length === 0) return;

    const file = fileInput.files[0];
    const reader = new FileReader();

    statusDiv.textContent = `Lendo arquivo "${file.name}"...`;
    statusDiv.className = 'status-message success';
    statusDiv.classList.remove('hidden');

    reader.onload = function(e) {
        try {
            let geojsonData = JSON.parse(e.target.result);

            if (sigasZone !== 'wgs84') {
                statusDiv.textContent = `Iniciando conversão de ${sigasZone} para WGS84...`;
                geojsonData = transformUtm(geojsonData, sigasZone);
            }
            
            // Armazena o GeoJSON original
            allGeojsonData = geojsonData;
            filteredFeatures = allGeojsonData.features;

            // Renderiza no mapa e atualiza controles
            renderMapLayer(filteredFeatures);
            updateControlPanels(allGeojsonData);

            statusDiv.textContent = `Sucesso! Arquivo "${file.name}" carregado. ${allGeojsonData.features.length} feições encontradas.`;
            statusDiv.className = 'status-message success';
        
        } catch (error) {
            statusDiv.textContent = `Erro ao processar o arquivo: ${error.message}`;
            statusDiv.className = 'status-message error';
            console.error("Erro no processamento do GeoJSON:", error);
        }
    };

    reader.readAsText(file);
}

// Função para renderizar a camada no mapa (uso para filtro e inicialização)
function renderMapLayer(featuresToRender) {
    if (currentLayer) {
        map.removeLayer(currentLayer);
    }
    
    const featureCollection = turf.featureCollection(featuresToRender);

    currentLayer = L.geoJson(featureCollection, {
        style: getFeatureStyle,
        onEachFeature: onEachFeature
    }).addTo(map);

    if (featuresToRender.length > 0) {
        map.fitBounds(currentLayer.getBounds());
    }
}

// Atualiza a lista de núcleos e as estatísticas
function updateControlPanels(geojsonData) {
    const nucleoSelect = document.getElementById('nucleo-filter');
    const mainList = document.getElementById('main-layer-list');
    
    // 1. Atualiza Filtro de Núcleo
    const nucleos = new Set(geojsonData.features.map(f => f.properties.NUCLEO || 'N/A').filter(n => n !== 'N/A'));
    nucleoSelect.innerHTML = '<option value="all">Todos os Lotes</option>';
    nucleos.forEach(nucleo => {
        nucleoSelect.innerHTML += `<option value="${nucleo}">${nucleo}</option>`;
    });

    // 2. Cria a lista de Camadas (simples, só a camada principal)
    mainList.innerHTML = `
        <li onclick="toggleMainLayer()">
            <span class="layer-name">
                <span class="layer-color-box" style="background-color: #004d99; border-color: #004d99;"></span>
                Lotes Carregados (${geojsonData.features.length})
            </span>
            <span id="main-layer-toggle" class="layer-toggle active">Esconder</span>
        </li>
    `;

    // 3. Atualiza os filtros de risco (cores)
    updateRiskFilterList();

    // 4. Atualiza os cards de resumo
    updateSummaryCards(geojsonData.features);
    
    // 5. Atualiza os destaques do relatório
    updateReportHighlights(geojsonData.features);
}

// Atualiza os filtros de risco (Grau 1 a 4)
function updateRiskFilterList() {
    const list = document.getElementById('risk-layer-filter');
    list.innerHTML = '';
    
    // Itera sobre os graus de risco
    Object.keys(RISK_GRADES).forEach(grade => {
        const data = RISK_GRADES[grade];
        const listItem = document.createElement('li');
        listItem.className = `risk-item ${data.toggle ? 'active' : ''}`;
        listItem.style.borderColor = data.color;
        listItem.setAttribute('data-grade', grade);
        listItem.innerHTML = `
            <span class="layer-name">${data.name}</span>
            <input type="checkbox" checked onchange="toggleRiskGrade('${grade}', this)">
        `;
        list.appendChild(listItem);
    });
}

// Lógica para ligar/desligar um grau de risco (cor)
function toggleRiskGrade(grade, checkbox) {
    RISK_GRADES[grade].toggle = checkbox.checked;
    const listItem = checkbox.closest('.risk-item');
    
    if (checkbox.checked) {
        listItem.classList.add('active');
    } else {
        listItem.classList.remove('active');
    }

    applyFilters();
}

// Lógica para ligar/desligar a camada principal
function toggleMainLayer() {
    const toggleSpan = document.getElementById('main-layer-toggle');

    if (map.hasLayer(currentLayer)) {
        map.removeLayer(currentLayer);
        toggleSpan.textContent = "Mostrar";
        toggleSpan.className = 'layer-toggle inactive';
    } else {
        map.addLayer(currentLayer);
        toggleSpan.textContent = "Esconder";
        toggleSpan.className = 'layer-toggle active';
    }
}

// --- 6. FUNCIONALIDADES DE FILTRO ---

// Função principal de aplicação de filtros (Núcleo e Risco)
function applyFilters() {
    if (!allGeojsonData) return;

    const selectedNucleo = document.getElementById('nucleo-filter').value;
    
    let features = allGeojsonData.features;

    // Filtro por Núcleo (Poligonal)
    if (selectedNucleo !== 'all') {
        features = features.filter(f => (f.properties.NUCLEO || 'N/A') === selectedNucleo);
    }

    // Filtro por Risco (Grau de Cor)
    const activeGrades = Object.keys(RISK_GRADES).filter(g => RISK_GRADES[g].toggle);
    features = features.filter(f => {
        const featureGrade = f.properties.GRAU_RISCO || 'NA';
        return activeGrades.includes(String(featureGrade)); // String(featureGrade) para garantir 'NA' vs número
    });

    filteredFeatures = features;
    
    // Renderiza a nova camada filtrada
    renderMapLayer(filteredFeatures);
    
    // Atualiza os cards com as novas estatísticas filtradas
    updateSummaryCards(filteredFeatures);
}

// Função chamada pela mudança no filtro de Núcleo
function filterByNucleo() {
    // A função applyFilters cuida do filtro de núcleo e risco
    applyFilters();
}

// --- 7. ATUALIZAÇÃO DOS CARDS DE RESUMO ---
function updateSummaryCards(features) {
    document.getElementById('total-lotes').textContent = features.length;

    let totalDesconformidades = 0;
    let totalLotesEmApp = 0;
    let custoTotal = 0;

    features.forEach(feature => {
        const props = feature.properties;
        if (props) {
            // Desconformidades (simulação: se tem GRAU_RISCO > 1 ou se é LOTE_APP = 'SIM')
            if ((props.GRAU_RISCO && props.GRAU_RISCO > 1) || (props.LOTE_APP && props.LOTE_APP.toUpperCase() === 'SIM')) {
                totalDesconformidades++;
            }
            
            // Lotes em APP
            if (props.LOTE_APP && props.LOTE_APP.toUpperCase() === 'SIM') {
                totalLotesEmApp++;
            }

            // Soma o custo
            if (props.CUSTO && typeof props.CUSTO === 'number') {
                custoTotal += props.CUSTO;
            }
        }
    });

    document.getElementById('total-desconformidades').textContent = totalDesconformidades;
    document.getElementById('total-app-lotes').textContent = totalLotesEmApp;
    document.getElementById('custo-estimado').textContent = `R$ ${custoTotal.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
    
    // Re-atualiza os destaques do relatório se o filtro for mudado (é bom para o usuário)
    updateReportHighlights(features);
}


// --- 8. FUNCIONALIDADES DE RELATÓRIO ---

// Atualiza os cartões de destaque de maior/menor custo de intervenção
function updateReportHighlights(features) {
    if (features.length === 0) {
        document.getElementById('max-cost-value').textContent = '---';
        document.getElementById('max-cost-info').textContent = 'Sem dados';
        document.getElementById('min-cost-value').textContent = '---';
        document.getElementById('min-cost-info').textContent = 'Sem dados';
        return;
    }

    let maxCostFeature = null;
    let minCostFeature = null;
    let maxCost = -Infinity;
    let minCost = Infinity;

    // Filtra apenas features com custo para análise
    const featuresWithCost = features.filter(f => f.properties.CUSTO && typeof f.properties.CUSTO === 'number');

    if (featuresWithCost.length === 0) {
        // Se não houver custo, exibe zero
        document.getElementById('max-cost-value').textContent = 'R$ 0,00';
        document.getElementById('max-cost-info').textContent = 'Nenhuma intervenção com custo definida.';
        document.getElementById('min-cost-value').textContent = 'R$ 0,00';
        document.getElementById('min-cost-info').textContent = 'Nenhuma intervenção com custo definida.';
        return;
    }

    featuresWithCost.forEach(f => {
        const custo = f.properties.CUSTO;
        
        if (custo > maxCost) {
            maxCost = custo;
            maxCostFeature = f;
        }
        
        if (custo < minCost) {
            minCost = custo;
            minCostFeature = f;
        }
    });

    const formatCost = (cost) => `R$ ${cost.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
    
    // Maior Custo
    if (maxCostFeature) {
        document.getElementById('max-cost-value').textContent = formatCost(maxCost);
        document.getElementById('max-cost-info').textContent = `Lote/ID: ${maxCostFeature.properties.ID_LOTE || maxCostFeature.properties.ID || 'N/A'}`;
    }

    // Menor Custo
    if (minCostFeature) {
        document.getElementById('min-cost-value').textContent = formatCost(minCost);
        document.getElementById('min-cost-info').textContent = `Lote/ID: ${minCostFeature.properties.ID_LOTE || minCostFeature.properties.ID || 'N/A'}`;
    }
}

// Simulação de Geração de Relatório
function generateReport() {
    if (!allGeojsonData) {
        alert("Por favor, carregue um arquivo GeoJSON primeiro.");
        return;
    }
    
    // --- 1. Dados para o Gráfico (Simulação) ---
    const riskCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 'NA': 0 };
    filteredFeatures.forEach(f => {
        const grade = f.properties.GRAU_RISCO || 'NA';
        riskCounts[grade] = (riskCounts[grade] || 0) + 1;
    });

    const labels = Object.keys(RISK_GRADES).map(key => RISK_GRADES[key].name);
    const dataValues = Object.keys(RISK_GRADES).map(key => riskCounts[key]);
    const backgroundColors = Object.keys(RISK_GRADES).map(key => RISK_GRADES[key].color);
    
    // --- 2. Simulação de Estrutura de Relatório ---
    const reportWindow = window.open('', 'Relatório GeoLaudo.AI', 'height=800,width=800');
    reportWindow.document.write(`
        <html>
        <head>
            <title>Relatório de Análise GeoLaudo.AI</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 30px; }
                h1, h2, h3 { color: #004d99; border-bottom: 2px solid #eee; padding-bottom: 5px; }
                .report-header { text-align: center; margin-bottom: 30px; }
                .report-header h1 { border-bottom: none; }
                .summary-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                .summary-table th, .summary-table td { border: 1px solid #ddd; padding: 10px; text-align: left; }
                .summary-table th { background-color: #f7f7f7; }
                .highlight-box { padding: 15px; border-radius: 5px; margin: 10px 0; }
                .max-cost-box { background-color: #ffe5e5; border-left: 5px solid #dc3545; }
                .min-cost-box { background-color: #e5ffe5; border-left: 5px solid #28a745; }
                .chart-container-report { width: 80%; margin: 30px auto; }
            </style>
            <script src="https://cdn.jsdelivr.net/npm/chart.js@3.7.1/dist/chart.min.js"></script>
        </head>
        <body>
            <div class="report-header">
                <h1>GeoLaudo.AI</h1>
                <h2>Relatório de Análise Geográfica - ${new Date().toLocaleDateString()}</h2>
                <p>Análise de: ${document.getElementById('nucleo-filter').options[document.getElementById('nucleo-filter').selectedIndex].text}</p>
            </div>

            <h2>1. Resumo Estatístico</h2>
            <table class="summary-table">
                <tr><th>Métrica</th><th>Valor</th></tr>
                <tr><td>Total de Lotes Analisados</td><td>${document.getElementById('total-lotes').textContent}</td></tr>
                <tr><td>Total de Desconformidades (Risco Alto/APP)</td><td>${document.getElementById('total-desconformidades').textContent}</td></tr>
                <tr><td>Lotes em Área de Preservação Permanente (APP)</td><td>${document.getElementById('total-app-lotes').textContent}</td></tr>
                <tr><td>Custo Total Estimado de Intervenção</td><td>${document.getElementById('custo-estimado').textContent}</td></tr>
            </table>

            <h2>2. Destaques de Intervenção para Otimização</h2>
            <div style="display: flex; gap: 20px;">
                <div class="highlight-box max-cost-box" style="flex: 1;">
                    <h3>Prioridade Máxima (Maior Custo)</h3>
                    <p><strong>Valor:</strong> ${document.getElementById('max-cost-value').textContent}</p>
                    <p><strong>Local/ID:</strong> ${document.getElementById('max-cost-info').textContent}</p>
                    <p style="font-size: 0.9em; margin-top: 15px;">* Sugestão: Reavaliar a intervenção neste local para otimização de recursos.</p>
                </div>
                <div class="highlight-box min-cost-box" style="flex: 1;">
                    <h3>Prioridade Rápida (Menor Custo)</h3>
                    <p><strong>Valor:</strong> ${document.getElementById('min-cost-value').textContent}</p>
                    <p><strong>Local/ID:</strong> ${document.getElementById('min-cost-info').textContent}</p>
                    <p style="font-size: 0.9em; margin-top: 15px;">* Sugestão: Intervenção de baixo custo e rápido retorno para iniciar ações.</p>
                </div>
            </div>

            <h2>3. Distribuição de Risco</h2>
            <div class="chart-container-report">
                <canvas id="riskChart"></canvas>
            </div>
            
            <h2>4. Visualização Geográfica (Trecho do Mapa)</h2>
            <p><strong>Nota:</strong> Esta área seria preenchida com uma captura de tela do mapa atual (com os filtros aplicados) ou um trecho específico de alta relevância (Ex: o lote de maior custo).</p>
            <div style="background-color: #f0f0f0; height: 300px; border: 1px solid #ccc; text-align: center; line-height: 300px;">
                [Área para Imagem do Mapa ou URL para o local]
            </div>

            <script>
                // Código para gerar o gráfico no pop-up
                const ctx = reportWindow.document.getElementById('riskChart').getContext('2d');
                new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: ${JSON.stringify(labels)},
                        datasets: [{
                            label: 'Lotes por Grau de Risco',
                            data: ${JSON.stringify(dataValues)},
                            backgroundColor: ${JSON.stringify(backgroundColors)},
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        scales: {
                            y: { beginAtZero: true }
                        }
                    }
                });
            </script>
        </body>
        </html>
    `);

    reportWindow.document.close();
}


// --- INICIALIZAÇÃO ---
window.onload = function() {
    initializeMap();
    // Abre a aba de Upload por padrão
    document.getElementById('UploadTab').classList.remove('hidden');
    document.querySelector('.tab-menu .tab-button').classList.add('active');
};
