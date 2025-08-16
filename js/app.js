// ===================== Estado Global do Aplicativo =====================
let map; // Apenas declaração, a inicialização ocorre em initMap()
let allLotesGeoJSON = { type: 'FeatureCollection', features: [] }; 
let allAPPGeoJSON = { type: 'FeatureCollection', features: [] };   
let allPoligonaisGeoJSON = { type: 'FeatureCollection', features: [] }; 

// Camadas Leaflet no mapa
let lotesLayer = null;
let appLayer = null;
let poligonaisLayer = null;

// Mapa de estilos para riscos
const riscoStyles = {
    'Baixo': { fillColor: '#2ecc71', color: 'white' },        
    'Médio': { fillColor: '#f39c12', color: 'white' },        
    'Alto': { fillColor: '#e74c3c', color: 'white' },         
    'Muito Alto': { fillColor: '#c0392b', color: 'white' },   
    'N/A': { fillColor: '#3498db', color: 'white' }           
};

// ===================== Inicialização do Mapa Leaflet =====================
function initMap() {
    console.log('initMap: Iniciando mapa Leaflet...'); 
    map = L.map('mapid').setView([-15.7801, -47.9292], 5); // Centraliza no Brasil
    console.log('initMap: Objeto mapa criado.'); 

    // Camadas base (tiles)
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 20,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });
    osmLayer.addTo(map); 

    const esriWorldImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 18, 
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    });

    // Controle de camadas base para o usuário escolher o basemap
    const baseMaps = {
        "OpenStreetMap": osmLayer,
        "Esri World Imagery (Satélite)": esriWorldImagery 
    };
    L.control.layers(baseMaps).addTo(map); 
    console.log('initMap: Controle de camadas base adicionado.'); 

    // Adiciona listeners para os checkboxes da legenda personalizada
    document.getElementById('toggleLotes').addEventListener('change', (e) => toggleLayerVisibility(lotesLayer, e.target.checked));
    document.getElementById('togglePoligonais').addEventListener('change', (e) => toggleLayerVisibility(poligonaisLayer, e.target.checked));
    document.getElementById('toggleAPP').addEventListener('change', (e) => toggleLayerVisibility(appLayer, e.target.checked));

    // Garante que o mapa renderize corretamente após estar visível no DOM
    map.invalidateSize(); 
    console.log('initMap: invalidateSize() chamado.'); 
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

// ===================== Navegação entre Seções =====================
function initNav() {
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
}

// ===================== Gerenciamento de Upload e Processamento de GeoJSON =====================
function initUpload() {
    console.log('initUpload: Configurando upload de arquivos...'); 
    const fileInput = document.getElementById('geojsonFileInput');
    const dragDropArea = document.querySelector('.drag-drop-area');
    const fileListElement = document.getElementById('fileList');
    const processAndLoadBtn = document.getElementById('processAndLoadBtn');
    const uploadStatus = document.getElementById('uploadStatus');
    const selectFilesVisibleButton = document.getElementById('selectFilesVisibleButton'); 

    let selectedFiles = []; 

    if (!fileInput) console.error('initUpload ERRO: #geojsonFileInput (input oculto) não encontrado!');
    if (!selectFilesVisibleButton) console.error('initUpload ERRO: #selectFilesVisibleButton (botão visível) não encontrado!');

    // Adiciona um listener de clique ao botão visível para disparar o clique no input de arquivo oculto
    if (selectFilesVisibleButton && fileInput) {
        selectFilesVisibleButton.addEventListener('click', () => {
            console.log('Evento: Botão "Selecionar Arquivos" (visível) clicado. Disparando clique no input oculto...'); 
            fileInput.click(); 
        });
    } else {
        console.error('initUpload: Elementos de upload (botão visível ou input oculto) não encontrados ou inválidos. O upload não funcionará.');
    }

    // Listener para quando arquivos são selecionados no input de arquivo
    fileInput.addEventListener('change', (e) => {
        console.log('Evento: Arquivos selecionados no input de arquivo.', e.target.files); 
        selectedFiles = Array.from(e.target.files);
        if (selectedFiles.length === 0) {
            fileListElement.innerHTML = '<li>Nenhum arquivo selecionado.</li>';
        } else {
            fileListElement.innerHTML = ''; 
            selectedFiles.forEach(file => {
                const li = document.createElement('li');
                li.textContent = file.name;
                fileListElement.appendChild(li);
            });
        }
    });

    // Listener para arrastar e soltar (na área de drag-drop)
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
        const droppedFiles = Array.from(e.dataTransfer.files).filter(file => file.name.endsWith('.geojson') || file.name.endsWith('.json'));
        fileInput.files = createFileList(droppedFiles); 
        fileInput.dispatchEvent(new Event('change')); 
    });

    // Função auxiliar para criar uma FileList (necessário para drag and drop em alguns navegadores)
    function createFileList(files) {
        const dataTransfer = new DataTransfer();
        files.forEach(file => dataTransfer.items.add(file));
        return dataTransfer.files;
    }


    // Listener para o botão "Processar e Carregar Dados"
    processAndLoadBtn.addEventListener('click', async () => {
        console.log('Evento: Botão "Processar e Carregar Dados" clicado.'); 
        const filesToProcess = Array.from(fileInput.files || []);

        if (filesToProcess.length === 0) {
            uploadStatus.textContent = 'Nenhum arquivo para processar. Por favor, selecione arquivos GeoJSON.';
            uploadStatus.className = 'status-message error';
            return;
        }

        uploadStatus.textContent = 'Processando e carregando dados...';
        uploadStatus.className = 'status-message info';

        // Limpa camadas existentes no mapa
        if (lotesLayer) map.removeLayer(lotesLayer);
        if (appLayer) map.removeLayer(appLayer);
        if (poligonaisLayer) map.removeLayer(poligonaisLayer);
        allLotesGeoJSON.features = [];
        allAPPGeoJSON.features = [];
        allPoligonaisGeoJSON.features = [];

        for (const file of filesToProcess) {
            try {
                console.log(`Processando arquivo: ${file.name}`); 
                const reader = new FileReader();
                const fileContent = await new Promise((resolve, reject) => {
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = (e) => reject(e);
                    reader.readAsText(file);
                });
                const geojsonData = JSON.parse(fileContent);

                // Lógica para categorizar camadas por nome do arquivo
                const fileNameLower = file.name.toLowerCase();
                if (fileNameLower.includes('lote')) { 
                    allLotesGeoJSON.features.push(...geojsonData.features);
                } else if (fileNameLower.includes('app')) { 
                    allAPPGeoJSON.features.push(...geojsonData.features);
                } else { 
                    allPoligonaisGeoJSON.features.push(...geojsonData.features);
                }
                console.log(`Arquivo ${file.name} categorizado.`); 

            } catch (error) {
                console.error(`Erro ao carregar ou parsear ${file.name}:`, error); 
                uploadStatus.textContent = `Erro ao processar ${file.name}. Verifique o formato GeoJSON.`;
                uploadStatus.className = 'status-message error';
                return; 
            }
        }

        renderLayersOnMap();
        updateDashboard(allLotesGeoJSON.features);

        uploadStatus.textContent = 'Dados carregados e processados com sucesso! Vá para o Dashboard.';
        uploadStatus.className = 'status-message success';
        console.log('Todos os arquivos processados e dados carregados no mapa e dashboard.'); 
    });
}

// ===================== Renderização de Camadas no Mapa =====================
function renderLayersOnMap() {
    console.log('renderLayersOnMap: Renderizando camadas...'); 

    // Remove camadas antigas para evitar duplicação
    if (lotesLayer) map.removeLayer(lotesLayer);
    if (appLayer) map.removeLayer(appLayer);
    if (poligonaisLayer) map.removeLayer(poligonaisLayer);

    // Adiciona Lotes
    if (allLotesGeoJSON.features.length > 0) {
        lotesLayer = L.geoJSON(allLotesGeoJSON, {
            onEachFeature: onEachLoteFeature,
            style: styleLote
        }).addTo(map);
        // Ajusta o mapa para a extensão dos dados SOMENTE se houver dados
        map.fitBounds(lotesLayer.getBounds());
        console.log('renderLayersOnMap: Lotes adicionados e mapa ajustado.'); 
    } else {
        map.setView([-15.7801, -47.9292], 5);
        document.getElementById('toggleLotes').checked = false; 
        console.log('renderLayersOnMap: Nenhum lote para exibir, mapa centralizado.'); 
    }

    // Adiciona APP
    if (allAPPGeoJSON.features.length > 0) {
        appLayer = L.geoJSON(allAPPGeoJSON, {
            style: {
                color: '#e74c3c', 
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
        document.getElementById('toggleAPP').checked = false; 
        if (map.hasLayer(appLayer)) map.removeLayer(appLayer); 
        console.log('renderLayersOnMap: Camada APP carregada (mas invisível por padrão).'); 
    }

    // Adiciona Poligonais
    if (allPoligonaisGeoJSON.features.length > 0) {
        poligonaisLayer = L.geoJSON(allPoligonaisGeoJSON, {
            style: {
                color: '#2ecc71', 
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
        document.getElementById('togglePoligonais').checked = false;
        if (map.hasLayer(poligonaisLayer)) map.removeLayer(poligonaisLayer); 
        console.log('renderLayersOnMap: Camada Poligonais carregada (mas invisível por padrão).'); 
    }
}

// Estilo dos lotes baseado no risco
function styleLote(feature) {
    const risco = String(feature.properties.risco || 'N/A').toLowerCase();
    let color;
    if (risco.includes('baixo')) color = '#2ecc71';
    else if (risco.includes('médio')) color = '#f39c12';
    else if (risco.includes('alto') && !risco.includes('muito')) color = '#e74c3c';
    else if (risco.includes('muito alto')) color = '#c0392b';
    else color = '#3498db';

    return {
        fillColor: color,
        weight: 1,
        opacity: 1,
        color: 'white', 
        dashArray: '3', 
        fillOpacity: 0.7
    };
}

// Popup ao clicar no lote
function onEachLoteFeature(feature, layer) {
    if (feature.properties) {
        let popupContent = "<h3>Detalhes do Lote:</h3>";
        for (let key in feature.properties) {
            let value = feature.properties[key];
            if (value === null || value === undefined || value === '') value = 'N/A'; 
            let displayKey = key;
            switch(key.toLowerCase()){
                case 'cod_lote': displayKey = 'Código do Lote'; break;
                case 'desc_nucleo': displayKey = 'Núcleo'; break;
                case 'tipo_uso': displayKey = 'Tipo de Uso'; break;
                case 'area_m2': displayKey = 'Área (m²)'; break;
                case 'risco': displayKey = 'Status de Risco'; break;
                case 'valor': displayKey = 'Custo de Intervenção'; break;
            }
            popupContent += `<strong>${displayKey}:</strong> ${value}<br>`;
        }
        layer.bindPopup(popupContent);
    }
}


// ===================== Dashboard =====================
function updateDashboard(features) {
    console.log('updateDashboard: Atualizando cards do dashboard com', features.length, 'lotes.'); 
    document.getElementById('totalLotes').innerText = features.length;

    let lotesRiscoCount = 0; 
    let lotesAppCount = 0;
    let custoTotal = 0;

    features.forEach(f => {
        const p = f.properties || {};
        const risco = String(p.risco || '').toLowerCase();
        
        if (risco.includes('médio') || risco.includes('alto')) {
            lotesRiscoCount++;
        }
        
        const dentroApp = Number(p.dentro_app || 0); 
        if (dentroApp > 0) {
            lotesAppCount++;
        }
        
        custoTotal += (Number(p.valor) || 0); 
    });

    document.getElementById('lotesRisco').innerText = lotesRiscoCount;
    document.getElementById('lotesApp').innerText = lotesAppCount;
    document.getElementById('custoEstimado').innerText = custoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}


// ===================== Funções de Inicialização Principal (Chamadas no DOMContentLoaded) =====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded: Página e DOM carregados. Iniciando componentes...'); 
    initMap(); 
    initNav(); 
    initUpload(); 
    console.log('DOMContentLoaded: Configurações iniciais do app aplicadas.'); 
});
