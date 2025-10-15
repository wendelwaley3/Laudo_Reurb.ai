// Variáveis Globais para armazenar os dados e camadas
let map; 
let allLotesGeoJSON = { type: 'FeatureCollection', features: [] }; 
let allAPPGeoJSON = { type: 'FeatureCollection', features: [] };   
let allPoligonaisGeoJSON = { type: 'FeatureCollection', features: [] }; 
let filteredLotesFeatures = []; // Nova variável para as feições atualmente visíveis no mapa

// Camadas Leaflet no mapa
let lotesLayer = null;
let appLayer = null;
let poligonaisLayer = null;

const DEFAULT_CENTER = [-15.7801, -47.9297]; // Centro de Brasília

// ----------------------------------------------------
// NOVO: Definições de Cores e Níveis de Risco (Grau 1 a 4)
// Usando as cores solicitadas pelo usuário (Verde, Amarelo, Laranja, Vermelho)
const RISK_GRADES_CONFIG = {
    '1': { color: '#2ecc71', name: 'Grau 1 (Risco Baixo)', toggle: true, count: 0 },  // Verde
    '2': { color: '#f1c40f', name: 'Grau 2 (Risco Moderado)', toggle: true, count: 0 }, // Amarelo
    '3': { color: '#e67e22', name: 'Grau 3 (Risco Elevado)', toggle: true, count: 0 }, // Laranja
    '4': { color: '#e74c3c', name: 'Grau 4 (Risco Crítico)', toggle: true, count: 0 },  // Vermelho
    'NA': { color: '#7f8c8d', name: 'Sem Risco Atribuído', toggle: true, count: 0 } // Cinza
};

// ----------------------------------------------------
// 1. Inicializa o Mapa
function initMap() {
    console.log('initMap: Iniciando mapa...'); 
    
    // Verifica se o mapa já existe (para evitar duplicidade em re-renderizações)
    if (map) map.remove(); 

    map = L.map('mapid').setView(DEFAULT_CENTER, 4);

    // OpenStreetMap - Camada base padrão
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    // Inicializa a lista de camadas vazia
    updateLayerControl();
}

// ----------------------------------------------------
// 2. Lógica de Navegação/Abas
document.addEventListener('DOMContentLoaded', () => {
    initMap(); // Inicializa o mapa ao carregar a página
    setupTabNavigation();
    
    // Esconde o botão de exportar relatório até que um relatório seja gerado
    document.getElementById('exportReportBtn').style.display = 'none';
});

function setupTabNavigation() {
    console.log('setupTabNavigation: Configurando navegação por abas.');
    const navLinks = document.querySelectorAll('header nav a');
    const sections = document.querySelectorAll('.content-section');

    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetSectionId = this.getAttribute('data-section');

            // Remove a classe 'active' de todos os links e seções
            navLinks.forEach(l => l.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));

            // Adiciona a classe 'active' ao link clicado e à seção alvo
            this.classList.add('active');
            const targetSection = document.getElementById(targetSectionId);
            if (targetSection) {
                targetSection.classList.add('active');
            }

            // Invalida o tamanho do mapa se a aba dashboard for aberta
            if (targetSectionId === 'dashboard' && map) {
                setTimeout(() => {
                    map.invalidateSize();
                    if (lotesLayer) {
                         map.fitBounds(lotesLayer.getBounds());
                    } else {
                        map.setView(DEFAULT_CENTER, 4);
                    }
                }, 10);
            }
        });
    });

    // Garante que a primeira aba (Dashboard) esteja ativa ao carregar
    if (navLinks.length > 0) {
        document.getElementById('dashboard').classList.add('active');
        navLinks[0].classList.add('active');
    }
}

// ----------------------------------------------------
// 3. Lógica de Estilo e Camadas

// Função principal de estilo, aplicando a lógica de risco
function getStyleForRisco(feature, type = 'lotes') {
    if (type === 'lotes') {
        const riskGrade = String(feature.properties.GRAU_RISCO) || 'NA'; 
        const colorData = RISK_GRADES_CONFIG[riskGrade] || RISK_GRADES_CONFIG['NA'];

        return {
            fillColor: colorData.color,
            color: colorData.color,
            weight: 1.5,
            opacity: 0.8,
            fillOpacity: 0.7
        };
    } else if (type === 'app') {
        return {
            fillColor: '#3498db', // Azul para APP
            color: '#2980b9',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.4
        };
    } else if (type === 'poligonais') {
        return {
            fillColor: '#9b59b6', // Roxo
            color: '#8e44ad',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.5
        };
    }
}

// Adiciona Popups e Binds
function onEachFeature(feature, layer) {
    let popupContent = "<strong>Dados do Lote/Feição:</strong><br>";
    if (feature.properties) {
        for (const key in feature.properties) {
            if (feature.properties.hasOwnProperty(key) && key.length < 30 && key.toUpperCase() !== 'ID') {
                let value = feature.properties[key];
                if (key.toUpperCase().includes('CUSTO')) {
                     value = `R$ ${parseFloat(value).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
                }
                popupContent += `<b>${key}:</b> ${value}<br>`;
            }
        }
    }
    layer.bindPopup(popupContent);
}

// ----------------------------------------------------
// 4. Lógica de Reprojeção (UTM) - Mantida do seu código

function convertUtmToWgs84(easting, northing, utmZone) {
    // Implementação de conversão usando proj4js
    const zoneNum = utmZone.slice(0, -1);
    const projDef = `+proj=utm +zone=${zoneNum} +${utmZone.endsWith('s') ? 'south' : 'north'} +ellps=GRS80 +units=m +no_defs`;
    
    if (!proj4.defs(utmZone)) {
        proj4.defs(utmZone, projDef);
    }
    
    const utm = proj4.defs(utmZone);
    const wgs84 = proj4.defs('WGS84');
    
    return proj4(utm, wgs84, [easting, northing]); // Retorna [longitude, latitude]
}

function transformUtm(geojsonData, sigasZone) {
    if (sigasZone === 'wgs84' || !geojsonData.features || geojsonData.features.length === 0) {
        return geojsonData;
    }
    
    function transformCoordinates(coords) {
        if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
            return coords.map(transformCoordinates);
        } else if (coords.length >= 2 && typeof coords[0] === 'number') {
            const [easting, northing] = coords;
            // ATENÇÃO: ConvertUtmToWgs84 retorna [longitude, latitude], que é o formato GeoJSON [x, y]
            return convertUtmToWgs84(easting, northing, sigasZone); 
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

// ----------------------------------------------------
// 5. Lógica de Upload

function handleFileUpload(type) {
    const fileInput = document.getElementById(`geojson-${type}-file`);
    const statusDiv = document.getElementById(`status-${type}`);
    const sigasZone = document.getElementById(`siga-${type}-select`).value;

    if (fileInput.files.length === 0) return;

    const file = fileInput.files[0];
    const reader = new FileReader();

    statusDiv.textContent = `Lendo arquivo...`;
    statusDiv.className = 'upload-status';

    reader.onload = function(e) {
        try {
            let geojsonData = JSON.parse(e.target.result);

            if (sigasZone !== 'wgs84') {
                statusDiv.textContent = `Convertendo de ${sigasZone}...`;
                geojsonData = transformUtm(geojsonData, sigasZone);
            }
            
            // Armazena no GeoJSON global correto
            if (type === 'lotes') {
                allLotesGeoJSON = geojsonData;
            } else if (type === 'app') {
                allAPPGeoJSON = geojsonData;
            } else if (type === 'poligonais') {
                allPoligonaisGeoJSON = geojsonData;
            }

            statusDiv.textContent = `Sucesso! ${geojsonData.features.length} feições carregadas.`;
            statusDiv.className = 'upload-status status-success';
            
            // Atualiza o mapa e os controles
            updateMapLayers(type);
            updateSummaryCards(allLotesGeoJSON.features);
            updateNucleoFilter(allLotesGeoJSON.features);
            if (type === 'lotes') {
                updateRiskControl(allLotesGeoJSON.features);
            }
            // Mapeia os dados para a tabela
            if (type === 'lotes') {
                populateDataTable(allLotesGeoJSON.features);
            }
            

        } catch (error) {
            statusDiv.textContent = `Erro ao processar o arquivo: ${error.message}`;
            statusDiv.className = 'upload-status status-error';
            console.error("Erro no processamento do GeoJSON:", error);
        }
    };

    reader.readAsText(file);
}

// ----------------------------------------------------
// 6. Lógica de Renderização e Filtro

// Função que aplica filtros (Núcleo + Risco) e redesenha a camada de lotes
function applyFilters() {
    if (!allLotesGeoJSON || allLotesGeoJSON.features.length === 0) return;

    const selectedNucleo = document.getElementById('nucleo-filter').value;
    
    let features = allLotesGeoJSON.features;

    // 1. Filtro por Núcleo (Poligonal)
    if (selectedNucleo !== 'all') {
        features = features.filter(f => (f.properties.NUCLEO || 'N/A') === selectedNucleo);
    }

    // 2. Filtro por Risco (Grau de Cor)
    const activeGrades = Object.keys(RISK_GRADES_CONFIG).filter(g => RISK_GRADES_CONFIG[g].toggle);
    features = features.filter(f => {
        const featureGrade = String(f.properties.GRAU_RISCO) || 'NA';
        return activeGrades.includes(featureGrade); 
    });

    filteredLotesFeatures = features;
    
    // 3. Redesenha a camada
    renderLotesLayer(filteredLotesFeatures);
    
    // 4. Atualiza os cards com as novas estatísticas filtradas
    updateSummaryCards(filteredLotesFeatures);
}

// Desenha ou redesenha apenas a camada de lotes no mapa
function renderLotesLayer(featuresToRender) {
    if (lotesLayer) {
        map.removeLayer(lotesLayer);
    }
    
    if (featuresToRender.length === 0) {
        lotesLayer = null;
        return;
    }

    const featureCollection = turf.featureCollection(featuresToRender);

    lotesLayer = L.geoJson(featureCollection, {
        style: (feature) => getStyleForRisco(feature, 'lotes'),
        onEachFeature: onEachFeature
    }).addTo(map);

    // Ajusta o zoom para os dados renderizados
    map.fitBounds(lotesLayer.getBounds());
}

// Desenha/redesenha todas as camadas (chamado após upload)
function updateMapLayers(type) {
    // 1. Lotes (sempre chama o filtro completo para lotes)
    if (type === 'lotes') {
        applyFilters(); 
    }
    
    // 2. APP
    if (appLayer) map.removeLayer(appLayer);
    if (allAPPGeoJSON.features.length > 0) {
        appLayer = L.geoJson(allAPPGeoJSON, {
            style: (feature) => getStyleForRisco(feature, 'app'),
            onEachFeature: onEachFeature
        }).addTo(map);
        // Garante que a camada de lotes fique em cima
        if (lotesLayer) lotesLayer.bringToFront();
    } else {
        appLayer = null;
    }

    // 3. Poligonais
    if (poligonaisLayer) map.removeLayer(poligonaisLayer);
    if (allPoligonaisGeoJSON.features.length > 0) {
        poligonaisLayer = L.geoJson(allPoligonaisGeoJSON, {
            style: (feature) => getStyleForRisco(feature, 'poligonais'),
            onEachFeature: onEachFeature
        }).addTo(map);
        // Garante que a camada de lotes fique em cima
        if (lotesLayer) lotesLayer.bringToFront();
    } else {
        poligonaisLayer = null;
    }

    // Atualiza a lista de camadas no painel de controle
    updateLayerControl();
}

// ----------------------------------------------------
// 7. Controles do Dashboard (Filtros e Camadas)

// Atualiza o seletor de Núcleo
function updateNucleoFilter(features) {
    const nucleoSelect = document.getElementById('nucleo-filter');
    const nucleos = new Set(features.map(f => f.properties.NUCLEO || 'N/A').filter(n => n !== 'N/A'));
    
    // Mantém a opção "Todos"
    const currentOptions = nucleoSelect.innerHTML;
    nucleoSelect.innerHTML = currentOptions.split('</option>')[0] + '</option>'; 
    
    nucleos.forEach(nucleo => {
        nucleoSelect.innerHTML += `<option value="${nucleo}">${nucleo}</option>`;
    });
}

// NOVO: Atualiza o painel de controle de camadas (Lotes, APP, Poligonais)
function updateLayerControl() {
    const mainList = document.getElementById('main-layer-list');
    mainList.innerHTML = ''; // Limpa
    
    // Lotes
    if (allLotesGeoJSON.features.length > 0) {
        mainList.innerHTML += `
            <li class="layer-item" onclick="toggleLayer('lotes', this)">
                <span class="layer-name">
                    <span class="color-box" style="background-color: #2c3e50;"></span>
                    Lotes (${allLotesGeoJSON.features.length})
                </span>
                <input type="checkbox" ${lotesLayer ? 'checked' : ''} disabled>
            </li>
        `;
    }
    
    // APP
    if (allAPPGeoJSON.features.length > 0) {
        mainList.innerHTML += `
            <li class="layer-item" onclick="toggleLayer('app', this)">
                <span class="layer-name">
                    <span class="color-box" style="background-color: #3498db;"></span>
                    APP (${allAPPGeoJSON.features.length})
                </span>
                <input type="checkbox" ${appLayer ? 'checked' : ''}>
            </li>
        `;
    }
    
    // Poligonais
    if (allPoligonaisGeoJSON.features.length > 0) {
        mainList.innerHTML += `
            <li class="layer-item" onclick="toggleLayer('poligonais', this)">
                <span class="layer-name">
                    <span class="color-box" style="background-color: #9b59b6;"></span>
                    Outras Poligonais (${allPoligonaisGeoJSON.features.length})
                </span>
                <input type="checkbox" ${poligonaisLayer ? 'checked' : ''}>
            </li>
        `;
    }
}

// Lógica para ligar/desligar camadas principais (APP, Poligonais)
function toggleLayer(type, listItem) {
    const checkbox = listItem.querySelector('input[type="checkbox"]');
    
    if (type === 'app' && appLayer) {
        if (map.hasLayer(appLayer)) {
            map.removeLayer(appLayer);
            checkbox.checked = false;
        } else {
            map.addLayer(appLayer);
            checkbox.checked = true;
        }
    } else if (type === 'poligonais' && poligonaisLayer) {
        if (map.hasLayer(poligonaisLayer)) {
            map.removeLayer(poligonaisLayer);
            checkbox.checked = false;
        } else {
            map.addLayer(poligonaisLayer);
            checkbox.checked = true;
        }
    }
}


// NOVO: Atualiza o painel de controle de Risco (Grau 1 a 4)
function updateRiskControl(features) {
    const list = document.getElementById('risk-layer-filter');
    list.innerHTML = '';
    
    // Zera os contadores
    Object.keys(RISK_GRADES_CONFIG).forEach(key => RISK_GRADES_CONFIG[key].count = 0);

    // Conta os lotes por grau de risco
    features.forEach(f => {
        const grade = String(f.properties.GRAU_RISCO) || 'NA';
        if (RISK_GRADES_CONFIG[grade]) {
            RISK_GRADES_CONFIG[grade].count++;
        }
    });

    // Gera o HTML dos filtros
    Object.keys(RISK_GRADES_CONFIG).forEach(grade => {
        const data = RISK_GRADES_CONFIG[grade];
        const listItem = document.createElement('li');
        listItem.className = `risk-legend-item ${data.toggle ? 'active' : ''}`;
        listItem.style.borderLeftColor = data.color;
        listItem.setAttribute('data-grade', grade);
        listItem.innerHTML = `
            <span class="layer-name">${data.name}</span>
            <span style="font-size: 0.8em; font-weight: bold;">(${data.count})</span>
            <input type="checkbox" ${data.toggle ? 'checked' : ''} onchange="toggleRiskGrade('${grade}', this)">
        `;
        list.appendChild(listItem);
    });
}

// NOVO: Lógica para ligar/desligar um grau de risco (cor)
function toggleRiskGrade(grade, checkbox) {
    RISK_GRADES_CONFIG[grade].toggle = checkbox.checked;
    const listItem = checkbox.closest('.risk-legend-item');
    
    if (checkbox.checked) {
        listItem.classList.add('active');
    } else {
        listItem.classList.remove('active');
    }

    applyFilters(); // Aplica os novos filtros
}


// ----------------------------------------------------
// 8. Atualização dos Cards de Resumo

function updateSummaryCards(features) {
    document.getElementById('totalLotesCarregados').textContent = features.length;

    let totalLotesComRisco = 0;
    let totalLotesEmAPP = 0;
    let custoTotal = 0;

    features.forEach(feature => {
        const props = feature.properties;
        if (props) {
            // Lotes em Risco (Grau > 1 ou LOTE_APP = 'SIM')
            if ((props.GRAU_RISCO && props.GRAU_RISCO > 1) || (props.LOTE_APP && props.LOTE_APP.toUpperCase() === 'SIM')) {
                totalLotesComRisco++;
            }
            
            // Lotes em APP
            if (props.LOTE_APP && props.LOTE_APP.toUpperCase() === 'SIM') {
                totalLotesEmAPP++;
            }

            // Soma o custo
            // Assume que 'CUSTO' é uma propriedade numérica
            if (props.CUSTO && typeof props.CUSTO === 'number') {
                custoTotal += props.CUSTO;
            }
        }
    });

    document.getElementById('totalLotesComRisco').textContent = totalLotesComRisco;
    document.getElementById('totalLotesEmAPP').textContent = totalLotesEmAPP;
    document.getElementById('custoEstimadoTotal').textContent = `R$ ${custoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    // Atualiza os destaques de custo para o Relatório
    updateReportHighlights(features);
}

// ----------------------------------------------------
// 9. Destaques de Relatório (Maior/Menor Custo)

function updateReportHighlights(features) {
    const reportMaxCostEl = document.getElementById('report-max-cost');
    const reportMaxCostInfoEl = document.getElementById('report-max-cost-info');
    const reportMinCostEl = document.getElementById('report-min-cost');
    const reportMinCostInfoEl = document.getElementById('report-min-cost-info');

    // Reset
    reportMaxCostEl.textContent = 'R$ 0,00';
    reportMaxCostInfoEl.textContent = 'Lote/ID: N/A';
    reportMinCostEl.textContent = 'R$ 0,00';
    reportMinCostInfoEl.textContent = 'Lote/ID: N/A';

    if (features.length === 0) return;

    let maxCostFeature = null;
    let minCostFeature = null;
    let maxCost = -Infinity;
    let minCost = Infinity;

    const featuresWithCost = features.filter(f => f.properties.CUSTO && typeof f.properties.CUSTO === 'number');

    if (featuresWithCost.length === 0) return;

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

    const formatCost = (cost) => `R$ ${cost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const getID = (f) => f.properties.ID_LOTE || f.properties.ID || 'N/A';
    
    if (maxCostFeature) {
        reportMaxCostEl.textContent = formatCost(maxCost);
        reportMaxCostInfoEl.textContent = `Lote/ID: ${getID(maxCostFeature)}`;
    }

    if (minCostFeature) {
        reportMinCostEl.textContent = formatCost(minCost);
        reportMinCostInfoEl.textContent = `Lote/ID: ${getID(minCostFeature)}`;
    }
}

// ----------------------------------------------------
// 10. Geração de Relatório e Gráfico

let riskChartInstance = null; // Para guardar a instância do Chart.js

document.getElementById('generateReportBtn').addEventListener('click', () => {
    if (allLotesGeoJSON.features.length === 0) {
        alert('Por favor, carregue os dados de lotes primeiro.');
        return;
    }
    
    const reportMsg = document.getElementById('report-message');
    const reportContent = document.getElementById('generatedReportContent');
    const featuresToReport = filteredLotesFeatures.length > 0 ? filteredLotesFeatures : allLotesGeoJSON.features;
    
    reportMsg.textContent = 'Gerando relatório...';

    // 1. Geração do Gráfico (Simulação)
    const labels = [];
    const dataValues = [];
    const backgroundColors = [];

    // Recalcula as contagens para o gráfico
    const riskCounts = {};
    Object.keys(RISK_GRADES_CONFIG).forEach(key => riskCounts[key] = 0);

    featuresToReport.forEach(f => {
        const grade = String(f.properties.GRAU_RISCO) || 'NA';
        riskCounts[grade] = (riskCounts[grade] || 0) + 1;
    });

    Object.keys(RISK_GRADES_CONFIG).forEach(grade => {
        labels.push(RISK_GRADES_CONFIG[grade].name);
        dataValues.push(riskCounts[grade]);
        backgroundColors.push(RISK_GRADES_CONFIG[grade].color);
    });

    // Destroi a instância anterior do gráfico se existir
    if (riskChartInstance) {
        riskChartInstance.destroy();
    }
    
    const ctx = document.getElementById('riskChartReport').getContext('2d');
    riskChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Lotes por Grau de Risco',
                data: dataValues,
                backgroundColor: backgroundColors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Quantidade de Lotes' } },
                x: { title: { display: true, text: 'Grau de Risco' } }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });


    // 2. Geração do Texto (Formato Profissional)
    const totalLotesFiltrados = featuresToReport.length;
    let custoTotalFiltrado = 0;
    featuresToReport.forEach(f => {
        if (f.properties.CUSTO && typeof f.properties.CUSTO === 'number') {
            custoTotalFiltrado += f.properties.CUSTO;
        }
    });

    let reportText = `RELATÓRIO DE ANÁLISE GEOGRÁFICA - GeoLaudo.AI\n\n`;
    reportText += `Data de Geração: ${new Date().toLocaleString('pt-BR')}\n`;
    reportText += `Núcleo Filtrado: ${document.getElementById('nucleo-filter').options[document.getElementById('nucleo-filter').selectedIndex].text}\n\n`;

    reportText += `--- 1. RESUMO GERAL ---\n`;
    reportText += `Total de Lotes Analisados: ${totalLotesFiltrados}\n`;
    reportText += `Total de Lotes em Risco (Grau 2 ou mais): ${document.getElementById('totalLotesComRisco').textContent}\n`;
    reportText += `Total de Lotes em APP: ${document.getElementById('totalLotesEmAPP').textContent}\n`;
    reportText += `\n`;

    reportText += `--- 2. DETALHAMENTO DE RISCO ---\n`;
    Object.keys(RISK_GRADES_CONFIG).forEach(grade => {
        reportText += `${RISK_GRADES_CONFIG[grade].name}: ${riskCounts[grade]} Lotes\n`;
    });
    reportText += `\n`;

    reportText += `--- 3. ANÁLISE DE CUSTO ESTIMADO ---\n`;
    reportText += `Custo Total Estimado para Intervenção: R$ ${custoTotalFiltrado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    reportText += `Lote com Maior Custo (${document.getElementById('report-max-cost').textContent}): ${document.getElementById('report-max-cost-info').textContent}\n`;
    reportText += `Lote com Menor Custo (${document.getElementById('report-min-cost').textContent}): ${document.getElementById('report-min-cost-info').textContent}\n`;
    reportText += `\nEste valor é uma estimativa e deve ser refinado com levantamentos de campo e orçamentos detalhados.\n\n`;


    reportText += `--- Fim do Relatório ---\n`;
    reportText += `Este relatório foi gerado automaticamente pelo GeoLaudo.AI.`;

    reportContent.textContent = reportText;
    reportContent.scrollTop = 0; 
    
    reportMsg.textContent = 'Relatório gerado com sucesso!';
    document.getElementById('exportReportBtn').style.display = 'inline-block'; // Mostra o botão de exportar
}


// ----------------------------------------------------
// 11. Funções de Tabela (Mantidas do seu código)

function populateDataTable(features) {
    const table = document.getElementById('lotesDataTable');
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    if (features.length === 0) return;

    // Cabeçalho (usa todas as chaves do primeiro objeto)
    const properties = features[0].properties;
    let headerRow = '<tr>';
    const keys = [];
    for (const key in properties) {
         if (properties.hasOwnProperty(key)) {
            headerRow += `<th>${key}</th>`;
            keys.push(key);
        }
    }
    headerRow += '</tr>';
    thead.innerHTML = headerRow;

    // Corpo
    features.forEach(feature => {
        let bodyRow = '<tr>';
        keys.forEach(key => {
            let value = feature.properties[key];
            if (key.toUpperCase().includes('CUSTO') && typeof value === 'number') {
                 value = `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            }
            bodyRow += `<td>${value}</td>`;
        });
        bodyRow += '</tr>';
        tbody.innerHTML += bodyRow;
    });
}

function filterDataTable() {
    const input = document.getElementById('dataTableFilter');
    const filter = input.value.toUpperCase();
    const table = document.getElementById('lotesDataTable');
    const tr = table.getElementsByTagName('tr');

    for (let i = 1; i < tr.length; i++) {
        let display = false;
        const td = tr[i].getElementsByTagName('td');
        for (let j = 0; j < td.length; j++) {
            if (td[j]) {
                const txtValue = td[j].textContent || td[j].innerText;
                if (txtValue.toUpperCase().indexOf(filter) > -1) {
                    display = true;
                    break;
                }
            }
        }
        tr[i].style.display = display ? '' : 'none';
    }
}

function exportDataTableToCSV() {
    // ... Lógica de exportação para CSV
    const table = document.getElementById('lotesDataTable');
    if (table.rows.length <= 1) {
        alert('Não há dados para exportar.');
        return;
    }

    let csv = [];
    // Pega o cabeçalho
    const headerRow = table.querySelector('thead tr');
    csv.push(Array.from(headerRow.cells).map(cell => cell.textContent).join(';'));

    // Pega o corpo (apenas linhas visíveis)
    const bodyRows = table.querySelectorAll('tbody tr');
    bodyRows.forEach(row => {
        if (row.style.display !== 'none') {
            csv.push(Array.from(row.cells).map(cell => {
                // Remove R$ e espaços para manter o CSV limpo (se for custo)
                let text = cell.textContent.replace(/\s\s+/g, ' ').trim();
                if (text.startsWith('R$')) {
                    text = text.replace('R$ ', '').replace('.', '').replace(',', '.');
                }
                return `"${text}"`; // Aspas para garantir que vírgulas no texto não quebrem o CSV
            }).join(';'));
        }
    });

    const csvFile = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(csvFile);
    link.download = 'dados_lotes_geolaudo.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ----------------------------------------------------
// 12. Lógica de Exportação do Relatório TXT

document.getElementById('exportReportBtn').addEventListener('click', () => {
    const reportContent = document.getElementById('generatedReportContent').textContent;
    if (reportContent.includes('Nenhum relatório gerado ainda')) {
        alert('Por favor, gere um relatório primeiro na aba "Relatórios".');
        return;
    }

    const blob = new Blob([reportContent], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'relatorio_geolaudo.txt');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

// ----------------------------------------------------
// FIM
