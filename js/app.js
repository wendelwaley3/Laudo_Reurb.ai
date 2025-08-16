// Variáveis Globais para armazenar os dados e camadas
let map; 
let allLotesGeoJSON = { type: 'FeatureCollection', features: [] };
let allAPPGeoJSON = { type: 'FeatureCollection', features: [] };   
let allPoligonaisGeoJSON = { type: 'FeatureCollection', features: [] }; 

// VARIÁVEL PARA INFORMAÇÕES GERAIS (MANUAL)
let generalProjectInfo = {}; 

// Camadas Leaflet no mapa
let lotesLayer = null;
let appLayer = null;
let poligonaisLayer = null;

// Mapa de estilos para riscos
const riscoStyles = {
    'Baixo': { fillColor: '#2ecc71', color: 'white' },        // Verde
    'Médio': { fillColor: '#f39c12', color: 'white' },        // Laranja
    'Alto': { fillColor: '#e74c3c', color: 'white' },         // Vermelho
    'Muito Alto': { fillColor: '#c0392b', color: 'white' },   // Vermelho escuro
    'N/A': { fillColor: '#3498db', color: 'white' }           // Azul padrão para risco não definido
};

// ========================================================================================
// IMPORTANTE: DEFINIÇÃO DO SISTEMA DE COORDENADAS UTM PARA REPROJEÇÃO
// ========================================================================================
// Baseado nas suas coordenadas (E/X: 341012,41 e N/Y: 7943447,24), assumimos SIRGAS 2000 / UTM Zone 23S.
// SE SEUS DADOS FOREM DE OUTRA ZONA UTM OU OUTRO DATUM, VOCÊ PRECISA MUDAR A DEFINIÇÃO ABAIXO.
// Você pode encontrar as definições PROJ4 em https://epsg.io/ (busque pelo seu EPSG, ex: 31983)
if (typeof proj4 !== 'undefined') {
    proj4.defs('EPSG:31983', '+proj=utm +zone=23 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');
} else {
    console.error("Proj4js não carregado. A reprojeção UTM não funcionará.");
}
// ========================================================================================


// 1. Inicializa o Mapa
function initMap() {
    console.log('initMap: Iniciando mapa...'); 
    map = L.map('mapid').setView([-15.7801, -47.9292], 5); 
    console.log('initMap: Objeto mapa criado.'); 

    // Basemap Esri World Street Map (Mais robusto para ser o padrão e carregar sempre)
    const esriStreetMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012',
        minZoom: 0,
        maxZoom: 19
    });
    esriStreetMap.addTo(map); // Define como o mapa base padrão

    // Basemap OpenStreetMap (Adicionado como opção)
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        minZoom: 0, 
        maxZoom: 19 
    });

    // Basemap Esri World Imagery (Satélite)
    const esriWorldImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    });

    // Controle de camadas base para o usuário escolher o basemap
    const baseMaps = {
        "Esri World Street Map": esriStreetMap, // Agora é o padrão
        "OpenStreetMap": osmLayer,
        "Esri World Imagery (Satélite)": esriWorldImagery 
    };
    L.control.layers(baseMaps).addTo(map); 
    console.log('initMap: Controle de camadas base adicionado.'); 

    // Adiciona listeners para os checkboxes da legenda personalizada
    document.getElementById('toggleLotes').addEventListener('change', (e) => toggleLayerVisibility(lotesLayer, e.target.checked));
    document.getElementById('togglePoligonais').addEventListener('change', (e) => toggleLayerVisibility(poligonaisLayer, e.target.checked));
    document.getElementById('toggleAPP').addEventListener('change', (e) => toggleLayerVisibility(appLayer, e.target.checked));
    
    // map.invalidateSize() é chamado em DOMContentLoaded e na mudança de abas
    console.log('initMap: Mapa inicializado com sucesso.'); 
}

// Função para ligar/desligar a visibilidade da camada no mapa
function toggleLayerVisibility(layer, isVisible) {
    if (layer) {
        if (isVisible && !map.hasLayer(layer)) {
            layer.addTo(map);
        } else if (!isVisible && map.hasLayer(layer)) {
            map.removeLayer(layer);
        }
    }
}

// 2. Navegação entre Seções
document.querySelectorAll('nav a').forEach(link => {
    link.addEventListener('click', function(e) {
        e.preventDefault();
        const targetSectionId = this.getAttribute('data-section');
        console.log(`Navegação: Clicado em ${targetSectionId}`); 

        // Remove 'active' de todas as seções e links
        document.querySelectorAll('main section').forEach(section => {
            section.classList.remove('active');
        });
        document.querySelectorAll('nav a').forEach(navLink => {
            navLink.classList.remove('active');
        });

        // Adiciona 'active' à seção e link clicados
        document.getElementById(targetSectionId).classList.add('active');
        this.classList.add('active');

        // Garante que o mapa renderize corretamente após a seção do dashboard se tornar visível
        if (targetSectionId === 'dashboard' && map) {
            console.log('Navegação: Dashboard ativado, invalidando tamanho do mapa.'); 
            map.invalidateSize();
        }
    });
});

// 3. Funções de Upload e Processamento de GeoJSON
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded: Página e DOM carregados.'); 
    initMap(); // Inicializa o mapa ao carregar a página
    setupFileUpload(); // Configura o upload de arquivos
    setupGeneralInfoForm(); // Configura o formulário de informações gerais
    // Garante que o dashboard esteja visível por padrão ao carregar a página
    document.getElementById('dashboard').classList.add('active');
    document.querySelector('nav a[data-section="dashboard"]').classList.add('active');
    console.log('DOMContentLoaded: Configurações iniciais do app aplicadas.'); 
});

function setupFileUpload() {
    console.log('setupFileUpload: Configurando upload de arquivos...'); 
    const fileInput = document.getElementById('geojsonFileInput');
    const dragDropArea = document.querySelector('.drag-drop-area');
    const fileListElement = document.getElementById('fileList');
    const processAndLoadBtn = document.getElementById('processAndLoadBtn');
    const uploadStatus = document.getElementById('uploadStatus');
    // SELECIONA O BOTÃO VISÍVEL PELO ID
    const selectFilesVisibleButton = document.getElementById('selectFilesVisibleButton'); 

    let selectedFiles = []; 

    // Verifica se os elementos foram encontrados (para depuração)
    if (!fileInput) console.error('setupFileUpload ERRO: #geojsonFileInput não encontrado!');
    if (!selectFilesVisibleButton) console.error('setupFileUpload ERRO: #selectFilesVisibleButton não encontrado!');

    // ADICIONA LISTENER DE CLIQUE AO BOTÃO VISÍVEL
    if (selectFilesVisibleButton && fileInput) {
        selectFilesVisibleButton.addEventListener('click', () => {
            console.log('Evento: Botão "Selecionar Arquivos" (visível) clicado. Disparando clique no input oculto.'); 
            fileInput.click(); // Isso abre o diálogo de seleção de arquivos do navegador
        });
    } else {
        console.error('setupFileUpload: Botão visível ou input de arquivo não encontrados. O upload não funcionará.');
    }

    // Lida com a seleção de arquivos via input (ocorrendo após o diálogo ser fechado)
    fileInput.addEventListener('change', (e) => {
        console.log('Evento: Arquivos selecionados no input de arquivo.', e.target.files); 
        selectedFiles = Array.from(e.target.files);
        displaySelectedFiles(selectedFiles);
    });

    // Lida com o arrastar e soltar
    dragDropArea.addEventListener('dragover', (e) => {
        e.preventDefault(); 
        dragDropArea.classList.add('dragging');
    });
    dragDropArea.addEventListener('dragleave', () => {
        dragDropArea.classList.remove('dragging');
    });
    dragDropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dragDropArea.classList.remove('dragging');
        selectedFiles = Array.from(e.dataTransfer.files).filter(file => file.name.endsWith('.geojson') || file.name.endsWith('.json'));
        displaySelectedFiles(selectedFiles);
    });

    // Exibe os nomes dos arquivos selecionados na lista
    function displaySelectedFiles(files) {
        console.log('displaySelectedFiles: Exibindo arquivos selecionados.'); 
        fileListElement.innerHTML = ''; 
        if (files.length === 0) {
            fileListElement.innerHTML = '<li>Nenhum arquivo selecionado.</li>';
        } else {
            files.forEach(file => {
                const li = document.createElement('li');
                li.textContent = file.name;
                fileListElement.appendChild(li);
            });
        }
    }

    // Botão Processar e Carregar Dados
    processAndLoadBtn.addEventListener('click', async () => {
        console.log('Evento: Botão "Processar e Carregar Dados" clicado.'); 
        if (selectedFiles.length === 0) {
            uploadStatus.textContent = 'Nenhum arquivo para processar. Por favor, selecione arquivos GeoJSON.';
            uploadStatus.className = 'status-message error';
            return;
        }

        uploadStatus.textContent = 'Processando e carregando dados...';
        uploadStatus.className = 'status-message info';

        // Limpa os dados globais e camadas do mapa antes de carregar novos
        allLotesGeoJSON.features = [];
        allAPPGeoJSON.features = [];
        allPoligonaisGeoJSON.features = [];
        
        // Remove as camadas atuais do mapa e do controle de legenda
        if (lotesLayer) map.removeLayer(lotesLayer);
        if (appLayer) map.removeLayer(appLayer);
        if (poligonaisLayer) map.removeLayer(poligonaisLayer);
        lotesLayer = null;
        appLayer = null;
        poligonaisLayer = null;


        const nucleosSet = new Set(); // Para coletar núcleos únicos dos lotes

        for (const file of selectedFiles) {
            try {
                console.log(`Processando arquivo: ${file.name}`); 
                const reader = new FileReader();
                const fileContent = await new Promise((resolve, reject) => {
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = (e) => reject(e);
                    reader.readAsText(file);
                });
                const geojsonData = JSON.parse(fileContent);

                // Validação básica do GeoJSON
                if (!geojsonData.type || !geojsonData.features) {
                     throw new Error('Arquivo GeoJSON inválido: missing "type" or "features" property.');
                }
                if (geojsonData.type !== 'FeatureCollection') {
                     console.warn(`Arquivo ${file.name} não é um FeatureCollection, pode não ser processado corretamente.`);
                }

                // Lógica para determinar se o GeoJSON precisa de reprojeção (UTM -> Lat/Lon)
                let featuresToLoad = [];

                // Heurística para detectar UTM: verifica se a primeira coordenada tem valores grandes de Northing e Easting
                if (geojsonData.features.length > 0 && typeof proj4 !== 'undefined' && typeof L.Proj !== 'undefined') {
                    const sampleFeature = geojsonData.features[0];
                    if (sampleFeature.geometry && sampleFeature.geometry.coordinates) {
                        let sampleCoord;
                        // Extrai uma coordenada válida para verificação, lidando com diferentes tipos de geometria
                        if (sampleFeature.geometry.type === 'Point') {
                            sampleCoord = sampleFeature.geometry.coordinates;
                        } else if (sampleFeature.geometry.type === 'LineString' || sampleFeature.geometry.type === 'MultiPoint') {
                            sampleCoord = sampleFeature.geometry.coordinates[0];
                        } else if (sampleFeature.geometry.type === 'Polygon' || sampleFeature.geometry.type === 'MultiLineString') {
                            sampleCoord = sampleFeature.geometry.coordinates[0][0];
                        } else if (sampleFeature.geometry.type === 'MultiPolygon') {
                            sampleCoord = sampleFeature.geometry.coordinates[0][0][0];
                        }
                        
                        if (sampleCoord && sampleCoord.length >= 2) {
                            const easting = sampleCoord[0]; // X
                            const northing = sampleCoord[1]; // Y

                            // Heurística para UTM no Brasil (especialmente Zonas 22S, 23S, 24S)
                            // Easting entre 100.000 e 900.000 (False Easting para não ter negativos)
                            // Northing grande (7 milhões a 10 milhões para Hemisfério Sul)
                            if (easting > 100000 && easting < 900000 && northing > 1000000 && northing < 10000000) {
                                console.log("Coordenadas detectadas como UTM. Reprojetando para WGS84...");
                                // Define o CRS para o Leaflet.Proj com base na definição do proj4.defs()
                                const utmCrs = new L.Proj.CRS('EPSG:31983'); // Usa a definição já criada no proj4.defs
                                
                                // O L.Proj.geoJson aceita um GeoJSON e um objeto de opções, onde crs é o CRS de ENTRADA do GeoJSON
                                featuresToLoad = L.Proj.geoJson(geojsonData, { crs: utmCrs }).toGeoJSON().features;
                            }
                        }
                    }
                }
                
                // Se não detectou UTM ou proj4/proj4leaflet não estão carregados, carrega as feições como estão (assumindo WGS84)
                if (featuresToLoad.length === 0 && geojsonData.features.length > 0) {
                    featuresToLoad = geojsonData.features;
                    console.log("Coordenadas carregadas como WGS84 ou reprojeção não aplicável.");
                }


                // Adiciona as feições processadas (originais ou reprojetadas) às camadas globais
                if (file.name.toLowerCase().includes('lotes')) {
                    allLotesGeoJSON.features.push(...featuresToLoad);
                    featuresToLoad.forEach(f => { // Usa featuresToLoad para popular núcleos
                        if (f.properties && f.properties.nucleo) {
                            nucleosSet.add(f.properties.nucleo);
                        }
                    });
                } else if (file.name.toLowerCase().includes('app')) {
                    allAPPGeoJSON.features.push(...featuresToLoad);
                } else { // Presume-se que o restante são poligonais diversas (ex: infraestrutura)
                    allPoligonaisGeoJSON.features.push(...featuresToLoad);
                }
                console.log(`Arquivo ${file.name} processado com sucesso.`); 

            } catch (error) {
                console.error(`Erro ao carregar ou processar ${file.name}:`, error); 
                uploadStatus.textContent = `Erro ao processar ${file.name}. Verifique o formato GeoJSON ou se é válido. Detalhes: ${error.message}`;
                uploadStatus.className = 'status-message error';
                // Limpa os dados carregados parcialmente em caso de erro
                allLotesGeoJSON.features = [];
                allAPPGeoJSON.features = [];
                allPoligonaisGeoJSON.features = [];
                return; // Para de processar outros arquivos se um falhar
            }
        }

        // Carrega as camadas processadas no mapa
        renderLayersOnMap();
        // Atualiza o dashboard
        updateDashboard(allLotesGeoJSON.features);
        // Preenche o filtro de núcleos
        populateNucleusFilter(Array.from(nucleosSet));
        // Atualiza a tabela
        updateLotesTable(allLotesGeoJSON.features);

        uploadStatus.textContent = 'Dados carregados e processados com sucesso! Agora vá para o Dashboard.';
        uploadStatus.className = 'status-message success';
        console.log('Todos os arquivos processados. Dados carregados no mapa e dashboard.'); 
    });
}

// 4. Renderiza as Camadas no Mapa
function renderLayersOnMap(featuresToDisplay = allLotesGeoJSON.features) {
    console.log('renderLayersOnMap: Renderizando camadas...'); 
    // Remove camadas existentes do mapa se houver
    if (lotesLayer) map.removeLayer(lotesLayer);
    if (appLayer) map.removeLayer(appLayer);
    if (poligonaisLayer) map.removeLayer(poligonaisLayer);

    // Carrega lotes
    if (featuresToDisplay.length > 0) {
        lotesLayer = L.geoJSON(featuresToDisplay, {
            onEachFeature: onEachFeatureLotes,
            style: styleLotes
        }).addTo(map);
        // Ajusta o mapa para a extensão dos dados SOMENTE se houver dados
        map.fitBounds(lotesLayer.getBounds());
        console.log('renderLayersOnMap: Lotes adicionados e mapa ajustado.'); 
    } else {
        // Se não houver lotes, centraliza o mapa no Brasil e limpa a camada de lotes
        map.setView([-15.7801, -47.9292], 5);
        document.getElementById('toggleLotes').checked = false; // Desmarca o checkbox
        console.log('renderLayersOnMap: Nenhum lote para exibir, mapa centralizado.'); 
    }

    // Carrega APP (não adiciona ao mapa por padrão, apenas o cria)
    if (allAPPGeoJSON && allAPPGeoJSON.features.length > 0) {
        appLayer = L.geoJSON(allAPPGeoJSON, {
            style: {
                color: '#e74c3c', // Vermelho para APP
                weight: 2,
                opacity: 0.7,
                fillOpacity: 0.2
            },
            onEachFeature: (feature, layer) => {
                 if (feature.properties) {
                    let popupContent = "<h3>Área de Preservação Permanente (APP)</h3>";
                    for (let key in feature.properties) {
                        popupContent += `<strong>${key}:</strong> ${feature.properties[key]}<br>`;
                    }
                    layer.bindPopup(popupContent);
                }
            }
        });
        // Garante que o checkbox do APP esteja desmarcado e a camada invisível
        document.getElementById('toggleAPP').checked = false;
        if (map.hasLayer(appLayer)) map.removeLayer(appLayer); // Apenas para garantir
        console.log('renderLayersOnMap: Camada APP carregada (mas invisível por padrão).'); 
    }

    // Carrega Poligonais diversas (infraestrutura, etc.)
    if (allPoligonaisGeoJSON && allPoligonaisGeoJSON.features.length > 0) {
        poligonaisLayer = L.geoJSON(allPoligonaisGeoJSON, {
            style: {
                color: '#2ecc71', // Verde para poligonais
                weight: 2,
                opacity: 0.7,
                fillOpacity: 0.2
            },
            onEachFeature: (feature, layer) => {
                 if (feature.properties) {
                    let popupContent = "<h3>Informações da Poligonal</h3>";
                    for (let key in feature.properties) {
                        popupContent += `<strong>${key}:</strong> ${feature.properties[key]}<br>`;
                    }
                    layer.bindPopup(popupContent);
                }
            }
        });
        // Garante que o checkbox de poligonais esteja desmarcado e a camada invisível
        document.getElementById('togglePoligonais').checked = false;
        if (map.hasLayer(poligonaisLayer)) map.removeLayer(poligonaisLayer); // Apenas para garantir
        console.log('renderLayersOnMap: Camada Poligonais carregada (mas invisível por padrão).'); 
    }
}

// Estilo dos lotes baseado no risco
function styleLotes(feature) {
    const risco = feature.properties.risco || 'N/A'; // Pega o risco ou 'N/A' se não definido
    const style = riscoStyles[risco] || riscoStyles['N/A']; // Pega o estilo correspondente ou o padrão

    return {
        fillColor: style.fillColor,
        weight: 1,
        opacity: 1,
        color: 'white', // Cor da borda
        dashArray: '3', // Borda tracejada
        fillOpacity: 0.7
    };
}

// Popup ao clicar no lote
function onEachFeatureLotes(feature, layer) {
    if (feature.properties) {
        let popupContent = "<h3>Detalhes do Lote:</h3>";
        // Itera sobre todas as propriedades e adiciona ao popup
        for (let key in feature.properties) {
            let value = feature.properties[key];
            if (value === null || value === undefined) value = 'N/A'; // Trata valores nulos/indefinidos

            if (key.toLowerCase().includes('area') && typeof value === 'number') {
                value = value.toLocaleString('pt-BR') + ' m²';
            }
            // CORREÇÃO AQUI: Verifique o nome da propriedade de custo no seu GeoJSON
            // Ex: se for 'valor_total_custo', mude aqui 'custo_intervencao' para 'valor_total_custo'
            if (key.toLowerCase().includes('custo') && typeof value === 'number') { // Mantém genérico para 'custo'
                value = 'R$ ' + value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
            // CORREÇÃO AQUI: Verifique o nome da propriedade de APP no seu GeoJSON
            // Ex: se for 'dentro_app', mude aqui 'app' para 'dentro_app'
            if (key.toLowerCase() === 'app' && typeof value === 'boolean') { // Mantém genérico para 'app'
                value = value ? 'Sim' : 'Não';
            }

            popupContent += `<strong>${key}:</strong> ${value}<br>`;
        }
        layer.bindPopup(popupContent);
    }
}

// 5. Atualiza o Dashboard
function updateDashboard(features) {
    console.log('updateDashboard: Atualizando cards do dashboard com', features.length, 'lotes.'); 
    document.getElementById('totalLotes').innerText = features.length;

    let lotesRiscoCount = 0;
    let lotesAppCount = 0;
    let custoTotal = 0;
    let riskCounts = { 'Baixo': 0, 'Médio': 0, 'Alto': 0, 'Muito Alto': 0 };

    features.forEach(feature => {
        // Assume que 'risco' e 'app' são propriedades do GeoJSON dos lotes
        const risco = feature.properties.risco || 'N/A';
        if (riskCounts.hasOwnProperty(risco)) { // Verifica se a categoria de risco existe
            riskCounts[risco]++;
        }
        
        if (risco !== 'Baixo' && risco !== 'N/A') { // Conta lotes com risco diferente de "Baixo"
            lotesRiscoCount++;
        }
        
        // CORREÇÃO AQUI: Verifique o nome da propriedade 'app' no seu GeoJSON
        // Use o nome exato da propriedade. Ex: se for 'em_app', mude abaixo.
        // O valor deve ser true/false ou "sim"/"não"
        if (feature.properties.app === true || String(feature.properties.app).toLowerCase() === 'sim') {
            lotesAppCount++;
        }
        // CORREÇÃO AQUI: Verifique o nome da propriedade 'custo_intervencao' no seu GeoJSON
        // Use o nome exato. Ex: se for 'custo', mude abaixo.
        // O valor deve ser numérico
        custoTotal += (feature.properties.custo_intervencao || 0);
    });

    document.getElementById('lotesRisco').innerText = lotesRiscoCount;
    document.getElementById('lotesApp').innerText = lotesAppCount;
    document.getElementById('custoEstimado').innerText = custoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    document.getElementById('riskLowCount').innerText = riskCounts['Baixo'] || 0;
    document.getElementById('riskMediumCount').innerText = riskCounts['Médio'] || 0;
    document.getElementById('riskHighCount').innerText = riskCounts['Alto'] || 0;
    document.getElementById('riskVeryHighCount').innerText = riskCounts['Muito Alto'] || 0;

    document.getElementById('areasIdentificadas').innerText = lotesRiscoCount; // Exemplo simplificado
    document.getElementById('areasIntervencao').innerText = lotesRiscoCount; // Exemplo simplificado (todos em risco precisam de intervenção)
}

// 6. Preenche o Filtro de Núcleos
function populateNucleusFilter(nucleos) {
    console.log('populateNucleusFilter: Preenchendo filtro de núcleos.'); 
    const filterSelect = document.getElementById('nucleusFilter');
    filterSelect.innerHTML = '<option value="all">Todos os Núcleos</option>';
    if (nucleos.length > 0) {
        nucleos.sort().forEach(nucleo => {
            const option = document.createElement('option');
            option.value = nucleo;
            option.textContent = nucleo;
            filterSelect.appendChild(option);
        });
    }

    // Preenche o filtro de núcleos do relatório também
    const reportNucleosSelect = document.getElementById('nucleosAnalise');
    reportNucleosSelect.innerHTML = '<option value="all">Todos os Núcleos</option>';
    if (nucleos.length > 0) {
        nucleos.sort().forEach(nucleo => {
            const option = document.createElement('option');
            option.value = nucleo;
            option.textContent = nucleo;
            reportNucleosSelect.appendChild(option);
        });
    } else {
        reportNucleosSelect.innerHTML = '<option value="none" disabled selected>Nenhum núcleo disponível. Faça o upload dos dados primeiro.</option>';
    }
}

// 7. Aplica Filtros no Dashboard (e mapa)
document.getElementById('applyFiltersBtn').addEventListener('click', () => {
    console.log('Evento: Botão "Aplicar Filtros" clicado.'); 
    const selectedNucleus = document.getElementById('nucleusFilter').value;
    let filteredFeatures = allLotesGeoJSON.features;

    if (selectedNucleus !== 'all') {
        filteredFeatures = allLotesGeoJSON.features.filter(f => f.properties.nucleo === selectedNucleus);
    }

    // Re-renderiza a camada de lotes no mapa com os dados filtrados
    renderLayersOnMap(filteredFeatures);
    
    // Atualiza o dashboard com os dados filtrados
    updateDashboard(filteredFeatures);
    // Atualiza a tabela com dados filtrados
    updateLotesTable(filteredFeatures); 
});

// 8. Tabela de Lotes Detalhados
function updateLotesTable(features) {
    console.log('updateLotesTable: Atualizando tabela de lotes com', features.length, 'recursos.'); 
    const tableBody = document.querySelector('#lotesDataTable tbody');
    tableBody.innerHTML = ''; // Limpa a tabela

    if (features.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7">Nenhum dado disponível. Faça o upload das camadas primeiro ou ajuste os filtros.</td></tr>';
        return;
    }

    features.forEach(feature => {
        const row = tableBody.insertRow();
        const props = feature.properties;

        row.insertCell().textContent = props.codigo || 'N/A';
        row.insertCell().textContent = props.nucleo || 'N/A';
        row.insertCell().textContent = props.tipo_uso || 'N/A';
        row.insertCell().textContent = (props.area_m2 && typeof props.area_m2 === 'number') ? props.area_m2.toLocaleString('pt-BR') : 'N/A';
        row.insertCell().textContent = props.risco || 'N/A';
        // CORREÇÃO AQUI: Garante que a coluna 'APP' exiba "Sim" ou "Não"
        // Use o nome exato da propriedade 'app' do seu GeoJSON
        row.insertCell().textContent = (props.app === true || String(props.app).toLowerCase() === 'sim') ? 'Sim' : 'Não';
        
        const actionsCell = row.insertCell();
        const viewBtn = document.createElement('button');
        viewBtn.textContent = 'Ver no Mapa';
        viewBtn.className = 'small-btn'; // Classe para estilizar o botão pequeno
        viewBtn.onclick = () => {
            // Navega para o dashboard primeiro
            document.querySelector('nav a[data-section="dashboard"]').click();
            
            // Encontra a camada do lote específico e centraliza o mapa
            if (lotesLayer) {
                lotesLayer.eachLayer(layer => {
                    if (layer.feature && layer.feature.properties && layer.feature.properties.codigo === props.codigo) {
                        map.setView(layer.getBounds().getCenter(), 18); // Centraliza e dá zoom
                        layer.openPopup(); // Abre o popup de detalhes
                    }
                });
            }
        };
        actionsCell.appendChild(viewBtn);
    });
}

// Busca na tabela
document.getElementById('lotSearch').addEventListener('keyup', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#lotesDataTable tbody tr');
    rows.forEach(row => {
        const textContent = row.textContent.toLowerCase();
        if (textContent.includes(searchTerm)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
});

// Exportar Tabela para CSV
document.getElementById('exportTableBtn').addEventListener('click', () => {
    console.log('Evento: Botão "Exportar Tabela" clicado.'); 
    const table = document.getElementById('lotesDataTable');
    let csv = [];
    // Cabeçalho
    const headerRow = [];
    table.querySelectorAll('thead th').forEach(th => {
        if (th.textContent !== 'Ações') { // Exclui a coluna de ações
            headerRow.push(`"${th.textContent.trim()}"`); // Adiciona aspas para lidar com vírgulas no texto
        }
    });
    csv.push(headerRow.join(';')); // Usa ponto e vírgula como separador para CSV pt-BR

    // Linhas de dados
    table.querySelectorAll('tbody tr').forEach(tr => {
        const row = [];
        tr.querySelectorAll('td').forEach((td, index) => {
            // Exclui a última coluna (Ações)
            if (index < tr.querySelectorAll('td').length - 1) {
                // Remove quebras de linha e aspas internas, adiciona aspas para campos com vírgulas
                let text = td.innerText.replace(/"/g, '""').replace(/\n/g, ' ').trim();
                row.push(`"${text}"`);
            }
        });
        csv.push(row.join(';'));
    });

    const csvString = csv.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'dados_lotes_geolaudo.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

// FUNÇÃO: Coleta e Salva os dados do Formulário de Informações Gerais
function setupGeneralInfoForm() {
    console.log('setupGeneralInfoForm: Configurando formulário de informações gerais.'); 
    const saveButton = document.getElementById('saveGeneralInfoBtn');
    const statusMessage = document.getElementById('generalInfoStatus');

    saveButton.addEventListener('click', () => {
        console.log('Evento: Botão "Salvar Informações Gerais" clicado.'); 
        // Função auxiliar para pegar valor de radio button group
        const getRadioValue = (name) => {
            const radios = document.getElementsByName(name);
            for (let i = 0; i < radios.length; i++) {
                if (radios[i].checked) {
                    return radios[i].value;
                }
            }
            return ''; // Retorna vazio se nada for selecionado
        };

        // Coleta todos os valores dos campos
        generalProjectInfo = {
            // Infraestrutura Básica
            ucConservacao: getRadioValue('ucConservacao'),
            protecaoMananciais: getRadioValue('protecaoMananciais'),
            tipoAbastecimento: document.getElementById('tipoAbastecimento').value.trim(),
            responsavelAbastecimento: document.getElementById('responsavelAbastecimento').value.trim(),
            tipoColetaEsgoto: document.getElementById('tipoColetaEsgoto').value.trim(),
            responsavelColetaEsgoto: document.getElementById('responsavelColetaEsgoto').value.trim(),
            sistemaDrenagem: getRadioValue('sistemaDrenagem'),
            drenagemInadequada: getRadioValue('drenagemInadequada'),
            logradourosIdentificados: getRadioValue('logradourosIdentificados'),
            
            // Restrições e Conflitos
            linhaTransmissao: getRadioValue('linhaTransmissao'),
            minerodutoGasoduto: getRadioValue('minerodutoGasoduto'),
            linhaFerrea: getRadioValue('linhaFerrea'),
            aeroporto: getRadioValue('aeroporto'),
            limitacoesOutras: getRadioValue('limitacoesOutras'),
            processoMP: getRadioValue('processoMP'),
            processosJudiciais: getRadioValue('processosJudiciais'),
            comarcasCRI: document.getElementById('comarcasCRI').value.trim(),
            
            // Aspectos Legais e Fundiários
            titularidadeArea: getRadioValue('titularidadeArea'),
            terraLegal: getRadioValue('terraLegal'),
            instrumentoJuridico: document.getElementById('instrumentoJuridico').value.trim(),
            legislacaoReurb: document.getElementById('legislacaoReurb').value.trim(),
            legislacaoAmbiental: getRadioValue('legislacaoAmbiental'),
            planoDiretor: getRadioValue('planoDiretor'),
            zoneamento: getRadioValue('zoneamento'),
            municipioOriginal: document.getElementById('municipioOriginal').value.trim(),
            matriculasOrigem: document.getElementById('matriculasOrigem').value.trim(),
            matriculasIdentificadas: document.getElementById('matriculasIdentificadas').value.trim(),

            // Ações e Medidas Propostas
            adequacaoDesconformidades: getRadioValue('adequacaoDesconformidades'),
            obrasInfraestrutura: getRadioValue('obrasInfraestrutura'),
            medidasCompensatorias: getRadioValue('medidasCompensatorias')
        };

        statusMessage.textContent = 'Informações gerais salvas com sucesso!';
        statusMessage.className = 'status-message success';
        console.log('Informações Gerais Salvas:', generalProjectInfo); 
    });
}


// 9. Gerador de Relatórios com IA (Simulada)
document.getElementById('generateReportBtn').addEventListener('click', () => {
    console.log('Evento: Botão "Gerar Relatório com IA" clicado.'); 
    const reportType = document.getElementById('reportType').value;
    const nucleosAnalise = document.getElementById('nucleosAnalise').value;
    const incDadosGerais = document.getElementById('incDadosGerais').checked;
    const incAnaliseRiscos = document.getElementById('incAnaliseRiscos').checked;
    const incAreasPublicas = document.getElementById('incAreasPublicas').checked;
    const incInformacoesGerais = document.getElementById('incInformacoesGerais').checked; 
    const incInfraestrutura = document.getElementById('incInfraestrutura').checked;
    const generatedReportContent = document.getElementById('generatedReportContent');

    if (!allLotesGeoJSON || allLotesGeoJSON.features.length === 0) {
        generatedReportContent.textContent = "Nenhum dado de lotes disponível para gerar o relatório. Faça o upload das camadas primeiro.";
        return;
    }
    // Verifica se as informações gerais foram preenchidas e salvas, se a seção for marcada para inclusão
    if (incInformacoesGerais && Object.keys(generalProjectInfo).length === 0) {
        generatedReportContent.textContent = "Seção 'Informações Gerais do Projeto' selecionada, mas nenhum dado foi salvo. Por favor, preencha e salve as informações na aba 'Informações Gerais'.";
        return;
    }

    let reportText = `RELATÓRIO GEOLAUDO.AI - ${reportType.toUpperCase()}\n`;
    reportText += `Data de Geração: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}\n\n`;

    let filteredFeatures = allLotesGeoJSON.features;
    if (nucleosAnalise !== 'all' && nucleosAnalise !== 'none') {
        filteredFeatures = allLotesGeoJSON.features.filter(f => f.properties.nucleo === nucleosAnalise);
        reportText += `Análise Focada no Núcleo: ${nucleosAnalise}\n\n`;
    } else {
        reportText += `Análise Abrangente (Todos os Núcleos)\n\n`;
    }

    // Conteúdo do relatório baseado nas opções selecionadas (IA SIMULADA)
    if (incDadosGerais) {
        reportText += `--- 1. Dados Gerais da Área Analisada ---\n`;
        reportText += `Total de Lotes Analisados: ${filteredFeatures.length}\n`;
        
        const totalArea = filteredFeatures.reduce((acc, f) => acc + (f.properties.area_m2 || 0), 0);
        reportText += `Área Total dos Lotes: ${totalArea.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²\n\n`;

        const uniqueTiposUso = new Set(filteredFeatures.map(f => f.properties.tipo_uso).filter(Boolean));
        if (uniqueTiposUso.size > 0) {
            reportText += `Principais Tipos de Uso Identificados: ${Array.from(uniqueTiposUso).join(', ')}\n\n`;
        }
    }

    if (incAnaliseRiscos) {
        const riskCounts = { 'Baixo': 0, 'Médio': 0, 'Alto': 0, 'Muito Alto': 0 };
        filteredFeatures.forEach(f => {
            const risco = f.properties.risco || 'N/A';
            if (riskCounts.hasOwnProperty(risco)) riskCounts[risco]++;
        });
        const lotesComRiscoElevado = riskCounts['Médio'] + riskCounts['Alto'] + riskCounts['Muito Alto'];
        const percRiscoElevado = (lotesComRiscoElevado / filteredFeatures.length * 100 || 0).toFixed(2);

        reportText += `--- 2. Análise de Riscos Geológicos e Ambientais ---\n`;
        reportText += `Distribuição de Risco dos Lotes:\n`;
        reportText += `- Baixo Risco: ${riskCounts['Baixo'] || 0} lotes\n`;
        reportText += `- Médio Risco: ${riskCounts['Médio'] || 0} lotes\n`;
        reportText += `- Alto Risco: ${riskCounts['Alto'] || 0} lotes\n`;
        reportText += `- Muito Alto Risco: ${riskCounts['Muito Alto'] || 0} lotes\n\n`;
        reportText += `Total de Lotes com Risco Elevado (Médio, Alto, Muito Alto): ${lotesComRiscoElevado} (${percRiscoElevado}% do total)\n`;
        
        if (lotesComRiscoElevado > 0) {
            reportText += `Recomendação: Áreas com risco médio a muito alto demandam estudos geotécnicos aprofundados e, possivelmente, intervenções estruturais para mitigação de riscos ou realocação, conforme a legislação vigente de REURB e plano de contingência municipal.\n\n`;
        } else {
            reportText += `Recomendação: A área analisada apresenta um perfil de baixo risco predominante, o que facilita o processo de regularização fundiária.\n\n`;
        }
    }

    if (incAreasPublicas) {
        const lotesEmAPP = filteredFeatures.filter(f => f.properties.app === true || String(f.properties.app).toLowerCase() === 'sim').length;
        reportText += `--- 3. Análise de Áreas de Preservação Permanente (APP) ---\n`;
        reportText += `Número de lotes que intersectam ou estão em APP: ${lotesEmAPP}\n`;
        if (lotesEmAPP > 0) {
            reportText += `Observação: A presença de lotes em Áreas de Preservação Permanente exige a aplicação de medidas específicas de regularização ambiental, como a recuperação da área degradada ou a compensação ambiental, conforme o Código Florestal e demais normativas ambientais aplicáveis à REURB.\n\n`;
        } else {
            reportText += `Observação: Não foram identificados lotes em Áreas de Preservação Permanente no conjunto de dados analisado, o que simplifica o licenciamento ambiental da regularização.\n\n`;
        }
    }

    // SEÇÃO: Informações Gerais do Projeto (Puxa do Formulário Manual)
    if (incInformacoesGerais && Object.keys(generalProjectInfo).length > 0) {
        const info = generalProjectInfo; // Usa as propriedades do objeto generalProjectInfo

        reportText += `--- 4. Informações de Contexto Geral e Infraestrutura do Projeto ---\n`;
        
        // Infraestrutura Básica
        reportText += `**Infraestrutura Básica:**\n`;
        reportText += `  - Unidades de Conservação Próximas: ${info.ucConservacao || 'Não informado'}.\n`;
        reportText += `  - Proteção de Mananciais na Área: ${info.protecaoMananciais || 'Não informado'}.\n`;
        reportText += `  - Abastecimento de Água: ${info.tipoAbastecimento || 'Não informado'}${info.responsavelAbastecimento ? ' (Responsável: ' + info.responsavelAbastecimento + ')' : ''}.\n`;
        reportText += `  - Coleta de Esgoto: ${info.tipoColetaEsgoto || 'Não informado'}${info.responsavelColetaEsgoto ? ' (Responsável: ' + info.responsavelColetaEsgoto + ')' : ''}.\n`;
        reportText += `  - Sistema de Drenagem: ${info.sistemaDrenagem || 'Não informado'}.\n`;
        reportText += `  - Lotes com Drenagem Inadequada: ${info.drenagemInadequada || 'Não informado'}.\n`;
        reportText += `  - Logradouros: ${info.logradourosIdentificados || 'Não informado'}.\n\n`;

        // Restrições e Conflitos
        reportText += `**Restrições e Conflitos:**\n`;
        if (info.linhaTransmissao === 'Sim' || info.minerodutoGasoduto === 'Sim' || info.linhaFerrea === 'Sim' || info.aeroporto === 'Sim' || info.limitacoesOutras === 'Sim') {
            reportText += `  - Foram identificadas as seguintes restrições/infraestruturas de grande porte:\n`;
            if (info.linhaTransmissao === 'Sim') reportText += `    - Linha de Transmissão de Energia.\n`;
            if (info.minerodutoGasoduto === 'Sim') reportText += `    - Mineroduto / Gasoduto.\n`;
            if (info.linhaFerrea === 'Sim') reportText += `    - Linha Férrea.\n`;
            if (info.aeroporto === 'Sim') reportText += `    - Proximidade de Aeroporto.\n`;
            if (info.limitacoesOutras === 'Sim') reportText += `    - Outras limitações de natureza diversa.\n`;
        } else {
            reportText += `  - Não foram identificadas restrições significativas de infraestruturas de grande porte ou outras limitações específicas.\n`;
        }
        reportText += `  - Processo no Ministério Público: ${info.processoMP || 'Não informado'}.\n`;
        reportText += `  - Processos Judiciais Existentes: ${info.processosJudiciais || 'Não informado'}.\n`;
        reportText += `  - Comarcas do CRI: ${info.comarcasCRI || 'Não informado/Não aplicável'}.\n\n`;

        // Aspectos Legais e Fundiários
        reportText += `**Aspectos Legais e Fundiários:**\n`;
        reportText += `  - Titularidade da Área: ${info.titularidadeArea || 'Não informado'}.\n`;
        reportText += `  - Programa Terra Legal: ${info.terraLegal || 'Não informado'}.\n`;
        reportText += `  - Instrumento Jurídico Principal: ${info.instrumentoJuridico || 'Não informado'}.\n`;
        reportText += `  - Legislação Municipal REURB: ${info.legislacaoReurb || 'Não informada'}.\n`;
        reportText += `  - Legislação Municipal Ambiental: ${info.legislacaoAmbiental || 'Não informada'}.\n`;
        reportText += `  - Plano Diretor Municipal: ${info.planoDiretor || 'Não informado'}.\n`;
        reportText += `  - Lei de Uso e Ocupação do Solo/Zoneamento: ${info.zoneamento || 'Não informado'}.\n`;
        reportText += `  - Município de Origem do Núcleo: ${info.municipioOriginal || 'Não informado/Atual'}.\n`;
        reportText += `  - Matrículas de Origem/Afetadas: ${info.matriculasOrigem || 'Não informadas.'}\n`;
        reportText += `  - Matrículas Identificadas: ${info.matriculasIdentificadas || 'Não informadas.'}\n\n`;

        // Ações e Medidas Propostas
        reportText += `**Ações e Medidas Propostas:**\n`;
        reportText += `  - Adequação para Correção de Desconformidades: ${info.adequacaoDesconformidades || 'Não informado'}.\n`;
        reportText += `  - Obras de Infraestrutura Essencial: ${info.obrasInfraestrutura || 'Não informado'}.\n`;
        reportText += `  - Medidas Compensatórias: ${info.medidasCompensatorias || 'Não informado'}.\n\n`;

        reportText += `Esta seção reflete informações gerais sobre a área do projeto, essenciais para uma análise contextualizada e para a tomada de decisões no processo de REURB.\n\n`;
    } else if (incInformacoesGerais) {
        reportText += `--- 4. Informações de Contexto Geral e Infraestrutura do Projeto ---\n`;
        reportText += `Nenhuma informação geral foi preenchida ou salva na aba 'Informações Gerais'. Por favor, preencha os dados e clique em 'Salvar Informações Gerais' antes de gerar o relatório com esta seção.\n\n`;
    }


    if (incInfraestrutura && allPoligonaisGeoJSON && allPoligonaisGeoJSON.features.length > 0) {
        reportText += `--- 5. Análise de Infraestrutura e Equipamentos Urbanos (Camadas Geoespaciais) ---\n`;
        reportText += `Foram detectadas ${allPoligonaisGeoJSON.features.length} poligonais de infraestrutura ou outras áreas de interesse (como vias, áreas verdes, equipamentos comunitários) nas camadas carregadas.\n`;
        reportText += `A presença e adequação da infraestrutura existente é um fator chave para a viabilidade e qualidade da regularização. Recomenda-se verificação detalhada da situação da infraestrutura básica (água, esgoto, energia, drenagem, acesso) em relação aos lotes.\n\n`;
    }
    
    // Custo de Intervenção (sempre incluído no final do relatório)
    const custoTotalFiltrado = filteredFeatures.reduce((acc, f) => acc + (f.properties.custo_intervencao || 0), 0);
    reportText += `--- 6. Custo de Intervenção Estimado ---\n`;
    reportText += `Custo Total Estimado para Intervenção nos Lotes Analisados: R$ ${custoTotalFiltrado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    reportText += `Este valor é uma estimativa e deve ser refinado com levantamentos de campo e orçamentos detalhados.\n\n`;


    reportText += `--- Fim do Relatório ---\n`;
    reportText += `Este relatório foi gerado automaticamente pelo GeoLaudo.AI. Para análises mais aprofundadas e validação legal, consulte um especialista qualificado e os órgãos competentes.`;

    generatedReportContent.textContent = reportText;
    generatedReportContent.scrollTop = 0; // Volta para o topo do relatório
});

// Exportar Relatório (botão no header)
document.getElementById('exportReportBtn').addEventListener('click', () => {
    console.log('Evento: Botão "Exportar Relatório" clicado.'); 
    const reportContent = document.getElementById('generatedReportContent').textContent;
    if (reportContent.includes('Nenhum relatório gerado ainda') || reportContent.includes('Nenhum dado de lotes disponível')) {
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
