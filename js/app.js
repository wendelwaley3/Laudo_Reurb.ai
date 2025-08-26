// ===================== Estado Global do Aplicativo =====================
// Centraliza variáveis de estado para facilitar a organização e manutenção.
const state = {
    map: null,
    layers: { // FeatureGroups para gerenciar as camadas do Leaflet
        lotes: null, // Será inicializado como L.featureGroup() em initMap
        app: null,   // Será inicializado como L.featureGroup() em initMap
        poligonais: null // Será inicializado como L.featureGroup() em initMap
    },
    allLotes: [],           // Array de todas as feições de lotes carregadas
    nucleusSet: new Set(),  // Set para armazenar nomes de núcleos únicos
    currentNucleusFilter: 'all', // Núcleo selecionado no filtro do Dashboard
    utmOptions: { useUtm: false, zone: 23, south: true }, // Configurações para reprojeção UTM client-side
    generalProjectInfo: {}, // Informações gerais do projeto (preenchimento manual)
    lastReportText: '',     // Último relatório gerado (para exportação)
};

// ===================== Utilidades Diversas =====================

/** Formata um número para moeda BRL. */
function formatBRL(n) {
    const v = Number(n || 0);
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Inicia o download de um arquivo de texto. */
function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url); // Libera o objeto URL
}

/** Calcula a área de uma feature usando Turf.js. */
function featureAreaM2(feature) {
    try {
        // Turf.area retorna em metros quadrados se a projeção for WGS84
        return turf.area(feature);
    } catch (e) {
        console.warn('Erro ao calcular área com Turf.js:', e);
        return 0;
    }
}

/** Garante que um anel de polígono seja fechado (primeiro e último ponto iguais). */
function ensurePolygonClosed(coords) {
    if (!coords || coords.length === 0) return coords;
    const first = coords[0];
    const last = coords[coords.length - 1];
    // Se o primeiro e o último ponto não são iguais, adiciona o primeiro no final
    if (first[0] !== last[0] || first[1] !== last[1]) {
        coords.push(first);
    }
    return coords;
}

// ===================== Reprojeção UTM → WGS84 (client-side com proj4js) =====================
// Esta seção permite que o app tente reprojetar GeoJSONs em UTM, se necessário.

/** Converte um ponto UTM (x,y) para Lat/Lng (WGS84). */
function utmToLngLat(x, y, zone, south) {
    // Definição dinâmica da projeção UTM (ex: SIRGAS 2000 / UTM zone 23S)
    const def = `+proj=utm +zone=${Number(zone)} ${south ? '+south ' : ''}+datum=WGS84 +units=m +no_defs`;
    // Retorna [longitude, latitude]
    const p = proj4(def, proj4.WGS84, [x, y]);
    return [p[0], p[1]]; 
}

/**
 * Converte um GeoJSON inteiro de UTM para WGS84.
 * Percorre as geometrias e aplica a conversão de coordenadas.
 * @param {object} geojson - O objeto GeoJSON (FeatureCollection, Feature, ou Geometry).
 * @param {number} zone - A zona UTM (1-60).
 * @param {boolean} south - True se for hemisfério Sul, False se Norte.
 * @returns {object} Um novo objeto GeoJSON com coordenadas em WGS84.
 */
function reprojectGeoJSONFromUTM(geojson, zone, south) {
    // Cria uma cópia profunda para não modificar o objeto original.
    const converted = JSON.parse(JSON.stringify(geojson)); 

    function convertGeometryCoords(coords, geomType) {
        if (!coords || coords.length === 0) return coords;

        if (geomType === 'Point') {
            return utmToLngLat(coords[0], coords[1], zone, south);
        } else if (geomType === 'LineString' || geomType === 'MultiPoint') {
            return coords.map(coord => utmToLngLat(coord[0], coord[1], zone, south));
        } else if (geomType === 'Polygon') {
            return coords.map(ring => ensurePolygonClosed(ring.map(coord => utmToLngLat(coord[0], coord[1], zone, south))));
        } else if (geomType === 'MultiLineString') {
            return coords.map(line => line.map(coord => utmToLngLat(coord[0], coord[1], zone, south)));
        } else if (geomType === 'MultiPolygon') {
            return coords.map(polygon => 
                polygon.map(ring => ensurePolygonClosed(ring.map(coord => utmToLngLat(coord[0], coord[1], zone, south))))
            );
        }
        return coords; // Retorna as coordenadas originais para tipos não mapeados
    }

    if (converted.type === 'FeatureCollection') {
        converted.features = converted.features.map(feature => {
            if (feature.geometry) {
                feature.geometry.coordinates = convertGeometryCoords(feature.geometry.coordinates, feature.geometry.type);
            }
            return feature;
        });
    } else if (converted.type === 'Feature') {
        if (converted.geometry) {
            converted.geometry.coordinates = convertGeometryCoords(converted.geometry.coordinates, converted.geometry.type);
        }
    } else { // Assume que é um objeto de geometria
        converted.coordinates = convertGeometryCoords(converted.coordinates, converted.type);
    }

    return converted;
}


// ===================== Simulações de IBGE e IA (para ambiente client-side) =====================
// Estas funções substituem as chamadas ao backend Flask no ambiente de produção do GitHub Pages.
// ===================== Detecção de Município por Coordenadas =====================
/**
 * Usa a API do Nominatim (OpenStreetMap) para descobrir o município a partir de coordenadas.
 * @param {L.LatLng} latlng - As coordenadas (latitude, longitude) do ponto central.
 * @returns {Promise<string>} O nome do município ou "Não Identificado".
 */
async function getMunicipioFromCoordinates(latlng) {
    const { lat, lng } = latlng;
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    console.log("Buscando município na URL:", url);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Erro na API do Nominatim: ${response.statusText}`);
        }
        const data = await response.json();
        console.log("Resposta da API Nominatim:", data);
        
        // A API retorna o nome da cidade em 'city', 'town', 'village', etc.
        const municipio = data.address?.city || data.address?.town || data.address?.village || "Não Identificado";
        return municipio;
    } catch (error) {
        console.error("Erro ao buscar município:", error);
        return "Não Identificado";
    }
}

/** Simula a busca de dados do IBGE para um município. */
function getSimulatedMunicipioData(nomeMunicipio) {
    const data = ibgeDataSimulado[nomeMunicipio];
    if (data) {
        return data;
    }
    return {
        municipio: nomeMunicipio,
        regiao: "Não informado",
        populacao: "N/D (Dados simulados)",
        area_km2: "N/D (Dados simulados)"
    };
}

/** Simula a geração de um laudo com IA no navegador. */
function generateSimulatedAILaudo(promptData) {
    let laudo = `\n[RELATÓRIO GERADO POR IA - SIMULADO]\n\n`;
    laudo += `**Tema Principal:** ${promptData.tema}\n`;
    laudo += `**Detalhes da Análise:** ${promptData.detalhes}\n\n`;

    if (promptData.dados_ibge && promptData.dados_ibge.municipio) {
        laudo += `--- Dados IBGE para ${promptData.dados_ibge.municipio} ---\n`;
        laudo += `Região: ${promptData.dados_ibge.regiao}\n`;
        laudo += `População Estimada: ${promptData.dados_ibge.populacao}\n`;
        laudo += `Área Territorial: ${promptData.dados_ibge.area_km2} km²\n\n`;
    }

    laudo += `**Análise Contextual:**\n`;
    laudo += `Baseado nos dados fornecidos e em conhecimentos gerais de REURB, a área apresenta características urbanísticas e fundiárias que demandam avaliação conforme a legislação. A infraestrutura básica e a regularidade documental são pontos cruciais para a consolidação da regularização.\n\n`;

    laudo += `**Recomendações:**\n`;
    laudo += `1. Verificação documental aprofundada dos títulos e matrículas.\n`;
    laudo += `2. Levantamento topográfico e cadastral detalhado para delimitação precisa dos lotes.\n`;
    laudo += `3. Análise ambiental para identificar e mitigar impactos, especialmente em áreas de preservação.\n`;
    laudo += `4. Planejamento de obras de infraestrutura quando necessário.\n\n`;

    laudo += `Este laudo é uma simulação e deve ser complementado por uma análise técnica e jurídica completa realizada por profissionais habilitados.\n\n`;

    return laudo;
}


// ===================== Inicialização do Mapa Leaflet =====================
function initMap() {
    console.log('initMap: Iniciando mapa Leaflet...'); 
    state.map = L.map('mapid').setView([-15.7801, -47.9292], 5); // Centraliza no Brasil
    console.log('initMap: Objeto mapa criado.'); 

    // Camadas base (tiles)
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 20,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });
    osmLayer.addTo(state.map); 

    const esriWorldImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 18, // Max zoom para Esri é 18
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    });

    // Controle de camadas base para o usuário escolher o basemap
    const baseMaps = {
        "OpenStreetMap": osmLayer,
        "Esri World Imagery (Satélite)": esriWorldImagery 
    };
    L.control.layers(baseMaps).addTo(state.map); 
    console.log('initMap: Controle de camadas base adicionado.'); 

    // Inicializa os FeatureGroups vazios e os adiciona ao mapa
    state.layers.lotes = L.featureGroup().addTo(state.map);
    state.layers.app = L.featureGroup().addTo(state.map); 
    state.layers.poligonais = L.featureGroup().addTo(state.map); 

    // Remove as camadas APP e Poligonais do mapa por padrão, para que o usuário as ative pela legenda
    state.map.removeLayer(state.layers.app);
    state.map.removeLayer(state.layers.poligonais);

    // Garante que o mapa renderize corretamente após estar visível no DOM
    state.map.invalidateSize(); 
    console.log('initMap: invalidateSize() chamado.'); 
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
            if (targetSectionId === 'dashboard' && state.map) {
                console.log('Navegação: Dashboard ativado, invalidando tamanho do mapa.'); 
                state.map.invalidateSize();
            }
        });
    });
}

// ===================== Gerenciamento de Upload e Processamento de GeoJSON =====================
function initUpload() {
    console.log('initUpload: Configurando upload de arquivos...'); 
    const fileInput = document.getElementById('geojsonFileInput');
    const dragDropArea = document.querySelector('.drag-drop-area'); // A div que é a área de drop
    const fileListElement = document.getElementById('fileList');
    const processAndLoadBtn = document.getElementById('processAndLoadBtn');
    const uploadStatus = document.getElementById('uploadStatus');

    // **CORREÇÃO AQUI**: Seleciona o botão visível PELO SEU ID
    const selectFilesVisibleButton = document.getElementById('selectFilesVisibleButton');

    // Elementos da UI de Reprojeção UTM
    const useUtmCheckbox = document.getElementById('useUtmCheckbox');
    const utmOptionsContainer = document.getElementById('utmOptionsContainer');
    const utmZoneInput = document.getElementById('utmZoneInput');
    const utmHemisphereSelect = document.getElementById('utmHemisphereSelect');

    // Listener para o checkbox UTM
    useUtmCheckbox.addEventListener('change', () => {
        state.utmOptions.useUtm = useUtmCheckbox.checked;
        utmOptionsContainer.style.display = useUtmCheckbox.checked ? 'flex' : 'none';
        console.log(`UTM reprojection toggled: ${state.utmOptions.useUtm}`);
    });
    // Listeners para os campos de configuração UTM
    utmZoneInput.addEventListener('input', () => { 
        state.utmOptions.zone = Number(utmZoneInput.value) || 23; 
        console.log(`UTM Zone set to: ${state.utmOptions.zone}`);
    });
    utmHemisphereSelect.addEventListener('change', () => { 
        state.utmOptions.south = (utmHemisphereSelect.value === 'S'); 
        console.log(`UTM Hemisphere set to: ${state.utmOptions.south ? 'South' : 'North'}`);
    });

    // **CORREÇÃO AQUI**: Adiciona um listener de clique ao botão visível para disparar o clique no input de arquivo oculto
    if (selectFilesVisibleButton && fileInput) {
        selectFilesVisibleButton.addEventListener('click', () => {
            console.log('Evento: Botão "Selecionar Arquivos" (visível) clicado. Disparando clique no input oculto...'); 
            fileInput.click(); // Isso abre o diálogo de seleção de arquivos do navegador
        });
    } else {
        console.error('initUpload: Elementos de upload (botão visível ou input oculto) não encontrados ou inválidos. O upload não funcionará.');
    }

    // Listener para quando arquivos são selecionados no input de arquivo
    fileInput.addEventListener('change', (e) => {
        console.log('Evento: Arquivos selecionados no input de arquivo.', e.target.files); 
        const selectedFilesArray = Array.from(e.target.files);
        if (selectedFilesArray.length === 0) {
            fileListElement.innerHTML = '<li>Nenhum arquivo selecionado.</li>';
        } else {
            fileListElement.innerHTML = ''; // Limpa a lista antes de adicionar novos
            selectedFilesArray.forEach(file => {
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
        fileInput.files = createFileList(droppedFiles); // Usa a função auxiliar
        fileInput.dispatchEvent(new Event('change')); // Dispara o evento change para atualizar a lista
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

        // Limpa camadas existentes no mapa e nos FeatureGroups
        state.layers.lotes.clearLayers();
        state.layers.app.clearLayers();
        state.layers.poligonais.clearLayers();
        state.allLotes = [];
        state.nucleusSet.clear();

        const newLotesFeatures = []; // Coleta todos os lotes de todos os arquivos 'lotes'
        const newAPPFeatures = [];   // Coleta todas as APPs de todos os arquivos 'app'
        const newPoligonaisFeatures = []; // Coleta todas as poligonais de outros arquivos

        for (const file of filesToProcess) {
            try {
                console.log(`Processando arquivo: ${file.name}`); 
                const reader = new FileReader();
                const fileContent = await new Promise((resolve, reject) => {
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = (e) => reject(e);
                    reader.readAsText(file);
                });
                let geojsonData = JSON.parse(fileContent);

                // --- Reprojeção UTM, se ativada ---
                if (state.utmOptions.useUtm) {
                    console.log(`Tentando reprojetar ${file.name} de UTM para WGS84 (Zona ${state.utmOptions.zone}, Hemisfério ${state.utmOptions.south ? 'Sul' : 'Norte'})...`);
                    try {
                        geojsonData = reprojectGeoJSONFromUTM(geojsonData, state.utmOptions.zone, state.utmOptions.south);
                        console.log(`Reprojeção de ${file.name} concluída.`);
                    } catch (e) {
                        console.error(`Falha na reprojeção de ${file.name}:`, e);
                        uploadStatus.textContent = `Erro: Falha na reprojeção UTM de ${file.name}. Verifique a zona/hemisfério ou converta o arquivo previamente.`;
                        uploadStatus.className = 'status-message error';
                        return; 
                    }
                }
                // --- Fim da Reprojeção UTM ---

                // Validação básica do GeoJSON
                if (!geojsonData.type || !geojsonData.features) {
                     throw new Error('Arquivo GeoJSON inválido: missing "type" or "features" property.');
                }
                if (geojsonData.type !== 'FeatureCollection') {
                     console.warn(`Arquivo ${file.name} não é um FeatureCollection, pode não ser processado corretamente.`);
                }

                // Lógica para categorizar camadas por nome do arquivo
                const fileNameLower = file.name.toLowerCase();
                if (fileNameLower.includes('lote')) { 
                    newLotesFeatures.push(...geojsonData.features);
                } else if (fileNameLower.includes('app')) { 
                    newAPPFeatures.push(...geojsonData.features);
                } else { 
                    newPoligonaisFeatures.push(...geojsonData.features);
                }
                console.log(`Arquivo ${file.name} categorizado.`); 

            } catch (error) {
                console.error(`Erro ao carregar ou parsear ${file.name}:`, error); 
                uploadStatus.textContent = `Erro ao processar ${file.name}. Verifique o formato GeoJSON ou se é válido. Detalhes: ${error.message}`;
                uploadStatus.className = 'status-message error';
                state.layers.lotes.clearLayers();
                state.layers.app.clearLayers();
                state.layers.poligonais.clearLayers();
                state.allLotes = [];
                state.nucleusSet.clear();
                return; 
            }
        }
        
        // Adiciona as feições aos FeatureGroups do Leaflet para exibição no mapa
        L.geoJSON(newAPPFeatures, { onEachFeature: onEachAppFeature, style: styleApp }).addTo(state.layers.app);
        
        // **NOVA LÓGICA DE DETECÇÃO DE MUNICÍPIO**
        // A função onEachPoligonalFeature agora será assíncrona
        await Promise.all(newPoligonaisFeatures.map(async feature => {
            const tempLayer = L.geoJSON(feature);
            const center = tempLayer.getBounds().getCenter();
            const municipio = await getMunicipioFromCoordinates(center);

            // Adiciona o nome do município detectado como uma nova propriedade
            feature.properties.municipio_detectado = municipio;

            // Se a propriedade 'municipio' original não existir, preenche com o detectado
            if (!feature.properties.municipio) {
                feature.properties.municipio = municipio;
            }
        }));
        
        L.geoJSON(newPoligonaisFeatures, { onEachFeature: onEachPoligonalFeature, style: stylePoligonal }).addTo(state.layers.poligonais);
        
        // Processa lotes e extrai núcleos
        state.allLotes = newLotesFeatures; 
        newLotesFeatures.forEach(f => {
            if (f.properties && f.properties.desc_nucleo) { 
                state.nucleusSet.add(f.properties.desc_nucleo);
            }
        });
        L.geoJSON(state.allLotes, { onEachFeature: onEachLoteFeature, style: styleLote }).addTo(state.layers.lotes);

        // Ajusta o mapa para a extensão de todos os dados carregados
        const allLayersGroup = L.featureGroup([state.layers.lotes, state.layers.app, state.layers.poligonais]);
        if (allLayersGroup.getLayers().length > 0) {
            try { 
                state.map.fitBounds(allLayersGroup.getBounds(), { padding: [20, 20] }); 
                console.log('Mapa ajustado para os bounds dos dados carregados.');
            } catch (e) {
                console.warn("Não foi possível ajustar o mapa aos bounds. Verifique as coordenadas dos seus GeoJSONs.", e);
            }
        } else {
            state.map.setView([-15.7801, -47.9292], 5); // Centraliza no Brasil se não houver dados
            console.log('Nenhum dado carregado, mapa centralizado no Brasil.');
        }

        // Atualiza UI
        populateNucleusFilter();
        refreshDashboard();
        fillLotesTable(); 

        uploadStatus.textContent = 'Dados carregados e processados com sucesso! Vá para o Dashboard ou Dados Lotes.';
        uploadStatus.className = 'status-message success';
        console.log('Todos os arquivos processados e dados carregados no mapa e dashboard.'); 
    });
        // Processa lotes e extrai núcleos
        state.allLotes = newLotesFeatures; 
        newLotesFeatures.forEach(f => {
            if (f.properties && f.properties.desc_nucleo) { 
                state.nucleusSet.add(f.properties.desc_nucleo);
            }
        });
        
        // Adiciona as feições aos FeatureGroups do Leaflet para exibição no mapa
        L.geoJSON(newAPPFeatures, { onEachFeature: onEachAppFeature, style: styleApp }).addTo(state.layers.app);
        L.geoJSON(newPoligonaisFeatures, { onEachFeature: onEachPoligonalFeature, style: stylePoligonal }).addTo(state.layers.poligonais);
        L.geoJSON(state.allLotes, { onEachFeature: onEachLoteFeature, style: styleLote }).addTo(state.layers.lotes);

        // Ajusta o mapa para a extensão de todos os dados carregados
        const allLayersGroup = L.featureGroup([state.layers.lotes, state.layers.app, state.layers.poligonais]);
        if (allLayersGroup.getLayers().length > 0) {
            try { 
                state.map.fitBounds(allLayersGroup.getBounds(), { padding: [20, 20] }); 
                console.log('Mapa ajustado para os bounds dos dados carregados.');
            } catch (e) {
                console.warn("Não foi possível ajustar o mapa aos bounds. Verifique as coordenadas dos seus GeoJSONs.", e);
            }
        } else {
            state.map.setView([-15.7801, -47.9292], 5); // Centraliza no Brasil se não houver dados
            console.log('Nenhum dado carregado, mapa centralizado no Brasil.');
        }

        // Atualiza UI
        populateNucleusFilter();
        refreshDashboard();
        fillLotesTable(); 

        uploadStatus.textContent = 'Dados carregados e processados com sucesso! Vá para o Dashboard ou Dados Lotes.';
        uploadStatus.className = 'status-message success';
        console.log('Todos os arquivos processados e dados carregados no mapa e dashboard.'); 
    });
}

// ===================== Estilos e Popups das Camadas Geoespaciais =====================

// Estilo dos lotes baseado no risco
function styleLote(feature) {
    const risco = String(feature.properties.risco || feature.properties.status_risco || feature.properties.grau || 'N/A').toLowerCase(); // Inclui 'grau'
    let color;
    if (risco === '1' || risco.includes('baixo')) color = '#2ecc71';      
    else if (risco === '2' || risco.includes('médio')) color = '#f1c40f'; // Amarelo
    else if (risco === '3' || risco.includes('alto')) color = '#e67e22'; // Laranja
    else if (risco === '4' || risco.includes('muito alto')) color = '#c0392b'; 
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

            // Formatação de valores específicos conforme as suas tabelas
            if (key.toLowerCase() === 'area_m2' && typeof value === 'number') { 
                value = value.toLocaleString('pt-BR') + ' m²';
            }
            if ((key.toLowerCase() === 'valor' || key.toLowerCase() === 'custo de intervenção') && typeof value === 'number') { 
                value = formatBRL(value);
            }
            if (key.toLowerCase() === 'dentro_app' && typeof value === 'number') { 
                value = (value > 0) ? `Sim (${value}%)` : 'Não'; 
            }
            // Mapeamento de nomes de propriedades para exibição no popup (adaptado para suas tabelas)
            let displayKey = key;
            switch(key.toLowerCase()){
                case 'cod_lote': displayKey = 'Código do Lote'; break;
                case 'desc_nucleo': displayKey = 'Núcleo'; break;
                case 'tipo_uso': displayKey = 'Tipo de Uso'; break;
                case 'area_m2': displayKey = 'Área (m²)'; break;
                case 'risco': displayKey = 'Status de Risco'; break;
                case 'dentro_app': displayKey = 'Em APP'; break;
                case 'valor': displayKey = 'Custo de Intervenção'; break;
                case 'tipo_edificacao': displayKey = 'Tipo de Edificação'; break;
                case 'nm_mun': displayKey = 'Município'; break; 
                case 'nome_logradouro': displayKey = 'Logradouro'; break;
                case 'numero_postal': displayKey = 'CEP'; break;
                case 'status_risco': displayKey = 'Status Risco'; break; 
                case 'cod_area': displayKey = 'Cód. Área'; break;
                case 'grau': displayKey = 'Grau'; break;
                case 'qtde_lote': displayKey = 'Qtde. Lote(s)'; break;
                case 'intervencao': displayKey = 'Intervenção'; break;
                case 'lotes_atingidos': displayKey = 'Lotes Atingidos'; break;
            }

            popupContent += `<strong>${displayKey}:</strong> ${value}<br>`;
        }
        layer.bindPopup(popupContent);
    }
}

// Estilo da camada APP
function styleApp(feature) {
    return {
        fillColor: '#006400', // Verde escuro
        weight: 2,           // Espessura da borda
        opacity: 1,          // Opacidade da borda
        color: '#006400',    // Cor da borda (verde escuro)
        dashArray: '5, 5',   // Borda tracejada (5 pixels desenhados, 5 pixels vazios)
        fillOpacity: 0.3     // Transparência do preenchimento (0.3 = 70% transparente)
    };
}
// Popup da camada APP
function onEachAppFeature(feature, layer) {
    if (feature.properties) {
        let popupContent = "<h3>Área de Preservação Permanente (APP)</h3>";
        for (let key in feature.properties) {
            popupContent += `<strong>${key}:</strong> ${feature.properties[key]}<br>`;
        }
        layer.bindPopup(popupContent);
    }
}

// Estilo da camada Poligonal
function stylePoligonal(feature) {
    return {
        color: '#2ecc71', // Verde para poligonais
        weight: 2,
        opacity: 0.7,
        fillOpacity: 0.2
    };
}

// Popup da camada Poligonal
async function onEachPoligonalFeature(feature, layer) {
    if (feature.properties) {
        const props = feature.properties;
        const municipioNome = props.municipio || props.nm_mun || 'Não informado'; 

        let popupContent = `<h3>Informações da Poligonal: ${municipioNome}</h3>`;
        popupContent += `<strong>Município:</strong> ${municipioNome}<br>`;
        if (props.area_m2) popupContent += `<strong>Área (m²):</strong> ${props.area_m2.toLocaleString('pt-BR')} m²<br>`;
        for (let key in props) {
            if (!['municipio', 'nm_mun', 'area_m2'].includes(key.toLowerCase())) {
                popupContent += `<strong>${key}:</strong> ${props[key]}<br>`;
            }
        }
        
        popupContent += `<button onclick="buscarInfoCidade('${municipioNome}')" style="margin-top:8
