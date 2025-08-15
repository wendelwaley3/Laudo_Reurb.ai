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
    'N/A': { fillColor: '#3498db', color: 'white' },           // Azul padrão para risco não definido
    'Geológico': { fillColor: '#e74c3c', color: 'white' }     // NOVO: Estilo para "Geológico" (exemplo: Alto risco)
};

// ========================================================================================
// IMPORTANTE: DEFINIÇÃO DO SISTEMA DE COORDENADAS UTM PARA REPROJEÇÃO
// ========================================================================================
// Baseado nas suas coordenadas (E/X: 341012,41 e N/Y: 7943447,24), assumimos SIRGAS 2000 / UTM Zone 23S (EPSG:31983).
// É CRÍTICO QUE VOCÊ CONFIRME O EPSG EXATO DOS SEUS DADOS.
// Você pode encontrar as definições PROJ4 em https://epsg.io/ (busque pelo seu EPSG, ex: 31983)
if (typeof proj4 !== 'undefined') {
    // Definimos a projeção para SIRGAS 2000 / UTM Zone 23S (EPSG:31983)
    // Se precisar de outra zona, mude o 'zone=XX' e possivelmente o 'south'/'north' e o EPSG.
    proj4.defs('EPSG:31983', '+proj=utm +zone=23 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');
    
    console.log("Definição EPSG:31983 carregada para reprojeção UTM.");
} else {
    console.error("Proj4js não carregado. A reprojeção UTM não funcionará. Certifique-se que o script proj4.min.js está no index.html.");
}
// ========================================================================================


// 1. Inicializa o Mapa
function initMap() {
    console.log('initMap: Iniciando mapa...'); 
    map = L.map('mapid').setView([-15.7801, -47.9292], 5); // Coordenadas iniciais (centro do Brasil)
    console.log('initMap: Objeto mapa criado.'); 

    // Basemap OpenStreetMap (Voltando ao OSM puro, que geralmente funciona)
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        minZoom: 0, 
        maxZoom: 19 
    });
    osmLayer.addTo(map); // Define como o mapa base padrão
    console.log('initMap: Basemap OpenStreetMap adicionado como padrão.'); 

    // Basemap Esri World Street Map (Agora como opção)
    const esriStreetMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012',
        minZoom: 0,
        maxZoom: 19
    });

    // Basemap Esri World Imagery (Satélite)
    const esriWorldImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    });

    // Controle de camadas base para o usuário escolher o basemap
    const baseMaps = {
        "OpenStreetMap": osmLayer, // Agora é o padrão
        "Esri World Street Map": esriStreetMap, 
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

                // Heurística para detectar UTM e reprojetar
                if (geojsonData.features.length > 0 && typeof proj4 !== 'undefined' && typeof L.Proj !== 'undefined' && proj4.defs['EPSG:31983']) { 
                    const sampleFeature = geojsonData.features[0];
                    if (sampleFeature.geometry && sampleFeature.geometry.coordinates) {
                        let sampleCoord = [];
                        const extractFirstCoord = (coords) => {
                            if (!coords || coords.length === 0) return null;
                            if (typeof coords[0] === 'number') return coords; // Point
                            if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') return coords[0]; // LineString, MultiPoint
                            if (Array.isArray(coords[0]) && Array.isArray(coords[0][0]) && typeof coords[0][0][0] === 'number') return coords[0][0][0]; // Polygon, MultiLineString
                            if (Array.isArray(coords[0]) && Array.isArray(coords[0][0]) && Array.isArray(coords[0][0][0]) && typeof coords[0][0][0][0] === 'number') return coords[0][0][0][0]; // MultiPolygon
                            return null;
                        };
                        sampleCoord = extractFirstCoord(sampleFeature.geometry.coordinates);
                        
                        if (sampleCoord && sampleCoord.length >= 2) {
                            const easting = sampleCoord[0];
                            const northing = sampleCoord[1];

                            // Heurística para UTM no Brasil (para SIRGAS 2000, zonas 22S, 23S, 24S)
                            // Easting entre 100.000 e 900.000
                            // Northing grande (7 milhões a 10 milhões para Hemisfério Sul)
                            if (easting > 100000 && easting < 900000 && northing > 1000000 && northing < 10000000) {
                                console.log(`Coordenadas de ${file.name} detectadas como UTM. Reprojetando para WGS84 usando EPSG:31983...`);
                                const utmCrs = new L.Proj.CRS('EPSG:31983'); 
                                featuresToLoad = L.Proj.geoJson(geojsonData, { crs: utmCrs }).toGeoJSON().features;
                                console.log(`Feições de ${file.name} reprojetadas com sucesso.`);
                            }
                        }
                    }
                }
                
                // Se não detectou UTM ou proj4/proj4leaflet não estão carregados, ou reprojeção não ocorreu,
                // carrega as feições como estão (assumindo WGS84)
                if (featuresToLoad.length === 0 && geojsonData.features.length > 0) {
                    featuresToLoad = geojsonData.features;
                    console.log(`Coordenadas de ${file.name} carregadas como WGS84 ou reprojeção não aplicável.`);
                }


                // Adiciona as feições processadas (originais ou reprojetadas) às camadas globais
                if (file.name.toLowerCase().includes('lotes')) {
                    allLotesGeoJSON.features.push(...featuresToLoad);
                    featuresToLoad.forEach(f => { 
                        // USA A PROPRIEDADE 'desc_nucleo' PARA O NOME DO NÚCLEO
                        if (f.properties && f.properties.desc_nucleo) { 
                            nucleosSet.add(f.properties.desc_nucleo);
                        }
                    });
                } else if (file.name.toLowerCase().includes('app')) {
                    allAPPGeoJSON.features.push(...featuresToLoad);
                } else { // Presume-se que o restante são poligonais diversas (ex: infraestrutura)
                    allPoligonaisGeoJSON.features.push(...featuresToLoad);
                }
                console.log(`Arquivo ${file.name} adicionado às camadas. Total de lotes até agora: ${allLotesGeoJSON.features.length}`); 

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
                        popupContent += `<strong>${key}:</strong> ${key.toLowerCase() === 'area' ? feature.properties[key].toLocaleString('pt-BR') + ' m²' : feature.properties[key]}<br>`;
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
                        popupContent += `<strong>${key}:</strong> ${key.toLowerCase() === 'area' ? feature.properties[key].toLocaleString('pt-BR') + ' m²' : feature.properties[key]}<br>`;
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
    // Busca a propriedade de risco, normaliza para maiúscula inicial
    let risco = feature.properties.risco || feature.properties['Status Risco'] || 'N/A'; 
    if (risco && typeof risco === 'string') {
        risco = risco.trim().charAt(0).toUpperCase() + risco.trim().slice(1).toLowerCase();
    }
    
    // Mapeia "Geológico" para "Alto" para fins de cor e contagem
    if (risco === 'Geologico') {
        risco = 'Alto'; // Ou 'Muito Alto' se preferir mais impacto visual
    }
    
    const style = riscoStyles[risco] || riscoStyles['N/A']; 

    return {
        fillColor: style.fillColor,
        weight: 1,
        opacity: 1,
        color: 'white', 
        dashArray: '3', 
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
            if (value === null || value === undefi
