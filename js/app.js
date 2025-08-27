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

const ibgeDataSimulado = {
    "Conselheiro Lafaiete": {
        municipio: "Conselheiro Lafaiete",
        regiao: "Sudeste",
        populacao: "131.200 (estimativa 2023)",
        area_km2: "367.359"
    },
    // Adicione mais dados simulados para outros municípios ou núcleos se quiser.
    // O GeoJSON de lotes precisa ter a propriedade 'nm_mun' ou 'municipio' para que isso funcione.
};

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

    // Elementos da UI de Reprojeção UTM (são opcionais, verificaremos se existem)
    const useUtmCheckbox = document.getElementById('useUtmCheckbox');
    const utmOptionsContainer = document.getElementById('utmOptionsContainer');
    const utmZoneInput = document.getElementById('utmZoneInput');
    const utmHemisphereSelect = document.getElementById('utmHemisphereSelect');

    // Listener para o checkbox UTM
    if (useUtmCheckbox) {
        useUtmCheckbox.addEventListener('change', () => {
            state.utmOptions.useUtm = useUtmCheckbox.checked;
            if (utmOptionsContainer) {
                utmOptionsContainer.style.display = useUtmCheckbox.checked ? 'flex' : 'none';
            }
            console.log(`UTM reprojection toggled: ${state.utmOptions.useUtm}`);
        });
    }
    // Listeners para os campos de configuração UTM
    if (utmZoneInput) {
        utmZoneInput.addEventListener('input', () => { 
            state.utmOptions.zone = Number(utmZoneInput.value) || 23; 
            console.log(`UTM Zone set to: ${state.utmOptions.zone}`);
        });
    }
    if (utmHemisphereSelect) {
        utmHemisphereSelect.addEventListener('change', () => { 
            state.utmOptions.south = (utmHemisphereSelect.value === 'S'); 
            console.log(`UTM Hemisphere set to: ${state.utmOptions.south ? 'South' : 'North'}`);
        });
    }

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

        const newLotesFeatures = [];
        const newAPPFeatures = [];
        const newPoligonaisFeatures = [];

        for (const file of filesToProcess) {
            try {
                let text = await file.text();
                let geojsonData = JSON.parse(text);

                // **REPROJEÇÃO AQUI, SE ATIVADA**
                if (state.utmOptions.useUtm) {
                    const zone = document.getElementById('utmZoneInput').value;
                    const south = document.getElementById('utmHemisphereSelect').value === 'S';
                    geojsonData = reprojectGeoJSONFromUTM(geojsonData, zone, south);
                }

                // ... (o resto da lógica de categorização permanece a mesma) ...
                const lname = file.name.toLowerCase();
                if (lname.includes('lote')) {
                    newLotesFeatures.push(...geojsonData.features);
                    geojsonData.features.forEach(f => state.nucleusSet.add(f.properties.desc_nucleo));
                } else if (lname.includes('app')) {
                    newAPPFeatures.push(...geojsonData.features);
                } else {
                    newPoligonaisFeatures.push(...geojsonData.features);
                }
            } catch (e) {
                uploadStatus.textContent = `Erro ao processar ${file.name}: ${e.message}`;
                uploadStatus.className = 'status-message error';
                return;
            }
        }

        // Adiciona as feições processadas ao mapa
        state.allLotes = newLotesFeatures;
        L.geoJSON(newAPPFeatures, { style: styleApp, onEachFeature: onEachAppFeature }).addTo(state.layers.app);
        L.geoJSON(newPoligonaisFeatures, { style: stylePoligonal, onEachFeature: onEachPoligonalFeature }).addTo(state.layers.poligonais);
        L.geoJSON(state.allLotes, { onEachFeature: onEachLoteFeature, style: styleLote }).addTo(state.layers.lotes);

        // Ajusta o zoom do mapa para a extensão dos dados
        const allLayersGroup = L.featureGroup([...state.layers.lotes.getLayers(), ...state.layers.app.getLayers(), ...state.layers.poligonais.getLayers()]);
        if (allLayersGroup.getLayers().length > 0) {
            try {
                state.map.fitBounds(allLayersGroup.getBounds(), { padding: [20, 20] });
            } catch (e) {
                console.warn("Não foi possível ajustar o mapa aos bounds. Verifique as coordenadas.", e);
            }
        }
        
        // Atualiza o restante da UI
        populateNucleusFilter();
        refreshDashboard();
        fillLotesTable();

        uploadStatus.textContent = 'Dados carregados com sucesso!';
        uploadStatus.className = 'status-message success';
    });
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
    // Busca por 'grau', 'risco' ou 'status_risco' e converte para minúsculas
    const risco = String(feature.properties.risco || feature.properties.status_risco || feature.properties.grau || 'N/A').toLowerCase();
    let color;

    // Mapeamento de risco para cores
    switch (risco) {
        case '1':
        case 'baixo':
            color = '#2ecc71'; // Verde
            break;
        case '2':
        case 'médio':
        case 'medio':
            color = '#f1c40f'; // Amarelo
            break;
        case '3':
        case 'alto':
        case 'geologico':
        case 'hidrologico':
            color = '#e67e22'; // Laranja
            break;
        case '4':
        case 'muito alto':
            color = '#c0392b'; // Vermelho
            break;
        default:
            color = '#3498db'; // Azul padrão (para lotes sem risco definido)
            break;
    }

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
        color: '#9b59b6', // Roxo claro para borda
        weight: 2,
        opacity: 0.7,
        fillColor: '#d7bde2', // Roxo claro para preenchimento
        fillOpacity: 0.2
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
        
        popupContent += `<button onclick="buscarInfoCidade('${municipioNome}')" style="margin-top:8px;">Ver informações do município</button>`;
        
        layer.bindPopup(popupContent);
    }
}
// ===================== Renderização de Camadas no Mapa =====================
function renderLayersOnMap(featuresToDisplay = state.allLotes) {
    console.log('renderLayersOnMap: Renderizando camadas...');
    
    // Limpa todas as camadas antes de redesenhar
    state.layers.lotes.clearLayers();
    state.layers.app.clearLayers();
    state.layers.poligonais.clearLayers();

    // Adiciona Lotes
    if (featuresToDisplay.length > 0) {
        L.geoJSON(featuresToDisplay, {
            onEachFeature: onEachLoteFeature,
            style: styleLote
        }).addTo(state.layers.lotes);
        console.log(`renderLayersOnMap: ${featuresToDisplay.length} lotes adicionados à camada.`);
    }

    // Adiciona APP (se houver)
    if (state.allAPPGeoJSON && state.allAPPGeoJSON.features.length > 0) {
        L.geoJSON(state.allAPPGeoJSON, {
            onEachFeature: onEachAppFeature,
            style: styleApp
        }).addTo(state.layers.app);
        console.log(`renderLayersOnMap: ${state.allAPPGeoJSON.features.length} feições de APP adicionadas à camada.`);
    }

    // Adiciona Poligonais (se houver)
    if (state.allPoligonaisGeoJSON && state.allPoligonaisGeoJSON.features.length > 0) {
        L.geoJSON(state.allPoligonaisGeoJSON, {
            onEachFeature: onEachPoligonalFeature,
            style: stylePoligonal
        }).addTo(state.layers.poligonais);
        console.log(`renderLayersOnMap: ${state.allPoligonaisGeoJSON.features.length} feições de Poligonais adicionadas à camada.`);
    }

    // Ajusta o zoom do mapa para a extensão dos dados carregados
    const allLayersGroup = L.featureGroup([
        state.layers.lotes,
        state.layers.app,
        state.layers.poligonais
    ]);

    if (allLayersGroup.getLayers().length > 0) {
        try {
            const bounds = allLayersGroup.getBounds();
            // Verifica se os bounds são válidos antes de tentar dar zoom
            if (bounds.isValid()) {
                state.map.fitBounds(bounds, { padding: [50, 50] });
                console.log('Mapa ajustado para os bounds dos dados carregados:', bounds);
            } else {
                console.warn("Bounds inválidos. O mapa não será ajustado. Verifique as coordenadas dos seus GeoJSONs.");
                state.map.setView([-15.7801, -47.9292], 5); // Centraliza no Brasil como fallback
            }
        } catch (e) {
            console.error("Erro ao ajustar o mapa aos bounds. Verifique as coordenadas.", e);
            state.map.setView([-15.7801, -47.9292], 5); // Centraliza no Brasil como fallback
        }
    } else {
        state.map.setView([-15.7801, -47.9292], 5); // Centraliza no Brasil se não houver dados
        console.log('Nenhum dado carregado, mapa centralizado no Brasil.');
    }
}
// ===================== Função simulada para buscar dados extras de cidade =====================
async function buscarInfoCidade(nomeCidade) {
    alert(`Buscando dados simulados para ${nomeCidade}...`);
    const dadosSimulados = getSimulatedMunicipioData(nomeCidade); 
    
    let info = `**Informações para ${dadosSimulados.municipio}:**\n`;
    info += `- Região: ${dadosSimulados.regiao}\n`;
    info += `- População Estimada: ${dadosSimulados.populacao}\n`;
    info += `- Área Territorial: ${dadosSimulados.area_km2} km²\n\n`;
    info += `(Estes dados são simulados. Para dados reais, um backend seria necessário.)`;

    alert(info);
    console.log("Dados do município simulados:", dadosSimulados);
}

// ===================== Filtros por Núcleo =====================
function populateNucleusFilter() {
    console.log('populateNucleusFilter: Preenchendo filtro de núcleos com:', Array.from(state.nucleusSet)); 
    const filterSelect = document.getElementById('nucleusFilter');
    const reportNucleosSelect = document.getElementById('nucleosAnalise');
    
    // Limpa os selects
    filterSelect.innerHTML = '<option value="all">Todos os Núcleos</option>';
    reportNucleosSelect.innerHTML = '<option value="all">Todos os Núcleos</option>';
    
    if (state.nucleusSet.size > 0) {
        const sortedNucleos = Array.from(state.nucleusSet).sort();
        sortedNucleos.forEach(nucleo => {
            if (nucleo && nucleo.trim() !== '') { 
                const option1 = document.createElement('option');
                option1.value = nucleo;
                option1.textContent = nucleo;
                filterSelect.appendChild(option1);

                const option2 = document.createElement('option');
                option2.value = nucleo;
                option2.textContent = nucleo;
                reportNucleosSelect.appendChild(option2);
            }
        });
    } else {
        reportNucleosSelect.innerHTML = '<option value="none" disabled selected>Nenhum núcleo disponível.</option>';
    }
}

/** Filtra os lotes com base no núcleo selecionado. */
function filteredLotes() {
    if (state.currentNucleusFilter === 'all') return state.allLotes;
    return state.allLotes.filter(f => f.properties?.desc_nucleo === state.currentNucleusFilter);
}

/** Aplica zoom ao mapa para a extensão dos lotes filtrados. */
function zoomToFilter() {
    const feats = filteredLotes();
    if (feats.length === 0) {
        state.map.setView([-15.7801, -47.9292], 5); 
        return;
    }
    const layer = L.geoJSON({ type: 'FeatureCollection', features: feats });
    try { state.map.fitBounds(layer.getBounds(), { padding: [20,20] }); } catch (e) {
        console.warn("Não foi possível ajustar o mapa ao filtro.", e);
    }
}

// ===================== Funções de Inicialização Principal (Chamadas no DOMContentLoaded) =====================
function initMainButtons() {
    document.getElementById('applyFiltersBtn').addEventListener('click', () => {
        state.currentNucleusFilter = document.getElementById('nucleusFilter').value; 
        refreshDashboard();
        fillLotesTable();
        zoomToFilter();
    });

    document.getElementById('generateReportBtn').addEventListener('click', gerarRelatorioIA);

    document.getElementById('exportReportBtn').addEventListener('click', () => {
        if (!state.lastReportText.trim()) {
            alert('Nenhum relatório para exportar. Gere um relatório primeiro.');
            return;
        }
        downloadText('relatorio_geolaudo.txt', state.lastReportText);
    });
    
    // Configura listener para a mudança no select de filtros (para aplicar o zoom também)
    document.getElementById('nucleusFilter').addEventListener('change', () => {
        state.currentNucleusFilter = document.getElementById('nucleusFilter').value;
        refreshDashboard();
        fillLotesTable();
        zoomToFilter(); // Zoom quando o filtro muda no Dashboard
    });
}

// ===================== Dashboard =====================
function refreshDashboard() {
    console.log('refreshDashboard: Atualizando cards do dashboard.');
    const feats = filteredLotes();
    const totalLotesCount = feats.length;

    let lotesEmRiscoGeral = 0; // Contagem para o card 'Lotes em Risco' (Médio, Alto, Muito Alto)
    let lotesAppCount = 0;
    let custoTotal = 0;
    let custoMin = Infinity;
    let custoMax = -Infinity;
    let riskCounts = { 'Baixo': 0, 'Médio': 0, 'Alto': 0, 'Muito Alto': 0 };

    feats.forEach(f => {
        const p = f.properties || {};
        // Pega o valor de risco de múltiplas colunas possíveis e converte para string e minúsculas
        const risco = String(p.risco || p.status_risco || p.grau || 'N/A').toLowerCase();

        // Contagem por nível de risco para a lista "Análise de Riscos"
        if (risco === '1' || risco.includes('baixo')) {
            riskCounts['Baixo']++;
        } else if (risco === '2' || risco.includes('médio') || risco.includes('medio')) {
            riskCounts['Médio']++;
        } else if (risco === '3' || risco.includes('alto') || risco === 'geologico' || risco === 'hidrologico') {
            riskCounts['Alto']++;
        } else if (risco === '4' || risco.includes('muito alto')) {
            riskCounts['Muito Alto']++;
        } else if (risco !== 'n/a' && risco !== 'null' && risco.trim() !== '') {
            console.warn(`Risco não mapeado encontrado: "${risco}" para lote`, p);
        }
        
        // Contagem para o card "Lotes em Risco" (qualquer risco que não seja 'Baixo')
        if (risco !== '1' && !risco.includes('baixo') && risco !== 'n/a' && risco !== 'null' && risco.trim() !== '') {
            lotesEmRiscoGeral++;
        }
        
        // Contagem de Lotes em APP
        const dentroApp = Number(p.dentro_app || p.app || 0);
        if (dentroApp > 0) {
            lotesAppCount++;
        }

        // Cálculo do Custo de Intervenção
        const valorCusto = Number(p.valor || p.custo_intervencao || 0);
        if (!isNaN(valorCusto) && valorCusto > 0) {
            custoTotal += valorCusto;
            if (valorCusto < custoMin) custoMin = valorCusto;
            if (valorCusto > custoMax) custoMax = valorCusto;
        }
    });

    // Atualiza os elementos do HTML
    document.getElementById('totalLotes').textContent = totalLotesCount;
    document.getElementById('lotesRisco').textContent = lotesEmRiscoGeral;
    document.getElementById('lotesApp').textContent = lotesAppCount;
    document.getElementById('custoEstimado').textContent = formatBRL(custoTotal).replace('R$', '').trim();

    document.getElementById('riskLowCount').textContent = riskCounts['Baixo'];
    document.getElementById('riskMediumCount').textContent = riskCounts['Médio'];
    document.getElementById('riskHighCount').textContent = riskCounts['Alto'];
    document.getElementById('riskVeryHighCount').textContent = riskCounts['Muito Alto'];

    // Para o resumo, usamos a mesma contagem do card
    document.getElementById('areasIdentificadas').textContent = lotesEmRiscoGeral;
    document.getElementById('areasIntervencao').textContent = lotesEmRiscoGeral;

    document.getElementById('minCustoIntervencao').textContent = `Custo Mínimo de Intervenção: ${custoMin === Infinity ? 'N/D' : formatBRL(custoMin)}`;
    document.getElementById('maxCustoIntervencao').textContent = `Custo Máximo de Intervenção: ${custoMax === -Infinity ? 'N/D' : formatBRL(custoMax)}`;
}
// ===================== Tabela de Lotes =====================
function fillLotesTable() {
    console.log('fillLotesTable: Preenchendo tabela de lotes.');
    const tbody = document.querySelector('#lotesDataTable tbody');
    const feats = filteredLotes();
    tbody.innerHTML = '';

    if (feats.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">Nenhum dado disponível.</td></tr>';
        return;
    }

    const fragment = document.createDocumentFragment();
    feats.forEach(f => {
        const p = f.properties || {};
        const tr = document.createElement('tr');
        const codLote = p.cod_lote || 'N/A';
        tr.innerHTML = `
            <td>${codLote}</td>
            <td>${p.desc_nucleo || 'N/A'}</td>
            <td>${p.tipo_uso || 'N/A'}</td>
            <td>${p.area_m2 ? p.area_m2.toLocaleString('pt-BR') : 'N/A'}</td>
            <td>${p.risco || p.status_risco || p.grau || 'N/A'}</td>
            <td>${(Number(p.dentro_app) > 0) ? 'Sim' : 'Não'}</td>
            <td><button class="zoomLoteBtn small-btn" data-codlote="${codLote}">Ver no Mapa</button></td>
        `;
        fragment.appendChild(tr);
    });
    tbody.appendChild(fragment);

    tbody.querySelectorAll('.zoomLoteBtn').forEach(btn => {
        btn.addEventListener('click', () => {
            const codLoteToZoom = btn.getAttribute('data-codlote');
            const loteToZoom = state.allLotes.find(l => l.properties?.cod_lote == codLoteToZoom);
            if (loteToZoom) {
                document.querySelector('nav a[data-section="dashboard"]').click();
                const tempLayer = L.geoJSON(loteToZoom);
                try { state.map.fitBounds(tempLayer.getBounds(), { padding: [50, 50] }); } catch (e) {
                    console.warn("Erro ao dar zoom no lote:", e);
                }
                state.layers.lotes.eachLayer(l => {
                    if (l.feature?.properties?.cod_lote == codLoteToZoom && l.openPopup) {
                        l.openPopup();
                    }
                });
            }
        });
    });
}

// ===================== Análise de Tipos de Uso =====================
function updateUseTypesAnalysis(features) {
    console.log('updateUseTypesAnalysis: Atualizando análise de tipos de uso...');
    const useTypesContainer = document.getElementById('useTypesAnalysis');
    useTypesContainer.innerHTML = ''; // Limpa o conteúdo anterior

    if (features.length === 0) {
        useTypesContainer.innerHTML = '<p>Nenhum dado para analisar.</p>';
        return;
    }

    const useTypeCounts = {};
    let totalWithUseType = 0;

    // 1. Contar a ocorrência de cada 'tipo_uso'
    features.forEach(f => {
        const p = f.properties || {};
        const useType = p.tipo_uso; // Pega o valor da propriedade 'tipo_uso'
        
        if (useType && useType !== 'N/A' && useType.trim() !== '') {
            if (useTypeCounts[useType]) {
                useTypeCounts[useType]++;
            } else {
                useTypeCounts[useType] = 1;
            }
            totalWithUseType++;
        }
    });

    if (totalWithUseType === 0) {
        useTypesContainer.innerHTML = "<p>Nenhum lote com a propriedade 'tipo_uso' definida foi encontrado.</p>";
        return;
    }

    // 2. Criar e adicionar os elementos HTML para cada tipo de uso
    for (const useType in useTypeCounts) {
        const count = useTypeCounts[useType];
        const percentage = ((count / totalWithUseType) * 100).toFixed(1);

        // Define um "ícone" com base no nome do tipo de uso (exemplo)
        let icon = '❓'; // Ícone padrão
        const lowerUseType = useType.toLowerCase();
        if (lowerUseType.includes('residencial')) icon = '🏠';
        if (lowerUseType.includes('comercial')) icon = '🏢';
        if (lowerUseType.includes('misto')) icon = '🏘️';
        if (lowerUseType.includes('institucional')) icon = '🏛️';
        if (lowerUseType.includes('vago')) icon = '🌳';

        const itemHTML = `
            <div class="use-type-item">
                <div class="icon">${icon}</div>
                <h4>${useType}</h4>
                <div class="percentage">${percentage}%</div>
                <div class="count">(${count} lotes)</div>
            </div>
        `;
        
        useTypesContainer.innerHTML += itemHTML;
    }
}```

    ```javascript
    // ...
    // Atualiza UI
    populateNucleusFilter();
    refreshDashboard();
    fillLotesTable(); 
    // ...
    ```
    **Insira a nova linha aqui:**
    ```javascript
    // ...
    // Atualiza UI
    populateNucleusFilter();
    refreshDashboard();
    fillLotesTable(); 
    updateUseTypesAnalysis(state.allLotes); // <-- INSERIR ESTA LINHA
    // ...
    ```

*   **Encontre a função `initMainButtons()`**. Dentro dela, localize o `applyFiltersBtn.onclick` e o `nucleusFilter.addEventListener`.

    ```javascript
    // ...
    document.getElementById('applyFiltersBtn').addEventListener('click', () => {
        state.currentNucleusFilter = document.getElementById('nucleusFilter').value; 
        refreshDashboard();
        fillLotesTable();
        zoomToFilter();
    });

    document.getElementById('nucleusFilter').addEventListener('change', () => {
        state.currentNucleusFilter = document.getElementById('nucleusFilter').value;
        refreshDashboard();
        fillLotesTable();
        zoomToFilter(); 
    });
    // ...
    ```
    **Insira a nova linha em ambos os locais:**
    ```javascript
    // ...
    document.getElementById('applyFiltersBtn').addEventListener('click', () => {
        state.currentNucleusFilter = document.getElementById('nucleusFilter').value; 
        refreshDashboard();
        fillLotesTable();
        updateUseTypesAnalysis(filteredLotes()); // <-- INSERIR ESTA LINHA
        zoomToFilter();
    });

    document.getElementById('nucleusFilter').addEventListener('change', () => {
        state.currentNucleusFilter = document.getElementById('nucleusFilter').value;
        refreshDashboard();
        fillLotesTable();
        updateUseTypesAnalysis(filteredLotes()); // <-- INSERIR ESTA LINHA
        zoomToFilter(); 
    });
    
/// ===================== Legenda / Toggle Camadas =====================
function initLegendToggles() {
    const toggle = (id, layer) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', () => {
            if (el.checked) layer.addTo(state.map); else state.map.removeLayer(layer);
        });
    };
    toggle('toggleLotes', state.layers.lotes);
    toggle('togglePoligonais', state.layers.poligonais);
    toggle('toggleAPP', state.layers.app);
}

// ===================== Formulário de Informações Gerais (Manual) =====================
function initGeneralInfoForm() {
    const saveButton = document.getElementById('saveGeneralInfoBtn');
    const statusMessage = document.getElementById('generalInfoStatus');

    saveButton.addEventListener('click', () => {
        const getRadioValue = (name) => {
            const radios = document.getElementsByName(name);
            for (let i = 0; i < radios.length; i++) {
                if (radios[i].checked) {
                    return radios[i].value;
                }
            }
            return ''; 
        };

        state.generalProjectInfo = {
            ucConservacao: getRadioValue('ucConservacao'),
            protecaoMananciais: getRadioValue('protecaoMananciais'),
            tipoAbastecimento: document.getElementById('tipoAbastecimento').value.trim(),
            responsavelAbastecimento: document.getElementById('responsavelAbastecimento').value.trim(),
            tipoColetaEsgoto: document.getElementById('tipoColetaEsgoto').value.trim(),
            responsavelColetaEsgoto: document.getElementById('responsavelColetaEsgoto').value.trim(),
            sistemaDrenagem: getRadioValue('sistemaDrenagem'),
            drenagemInadequada: getRadioValue('drenagemInadequada'),
            logradourosIdentificados: getRadioValue('logradourosIdentificados'),
            
            linhaTransmissao: getRadioValue('linhaTransmissao'),
            minerodutoGasoduto: getRadioValue('minerodutoGasoduto'),
            linhaFerrea: getRadioValue('linhaFerrea'),
            aeroporto: getRadioValue('aeroporto'),
            limitacoesOutras: getRadioValue('limitacoesOutras'),
            processoMP: getRadioValue('processoMP'),
            processosJudiciais: getRadioValue('processosJudiciais'),
            comarcasCRI: document.getElementById('comarcasCRI').value.trim(),
            
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

            adequacaoDesconformidades: getRadioValue('adequacaoDesconformidades'),
            obrasInfraestrutura: getRadioValue('obrasInfraestrutura'),
            medidasCompensatorias: getRadioValue('medidasCompensatorias')
        };

        statusMessage.textContent = 'Informações gerais salvas com sucesso (localmente)!';
        statusMessage.className = 'status-message success';
        console.log('Informações Gerais Salvas:', state.generalProjectInfo); 
    });
}


// ===================== Geração de Relatório com IA (Simulado) =====================
async function gerarRelatorioIA() {
    console.log('Gerando Relatório com IA (simulado)...'); 
    const reportType = document.getElementById('reportType').value;
    const nucleosAnalise = document.getElementById('nucleosAnalise').value;
    const incDadosGerais = document.getElementById('incDadosGerais').checked;
    const incAnaliseRiscos = document.getElementById('incAnaliseRiscos').checked;
    const incAreasPublicas = document.getElementById('incAreasPublicas').checked;
    const incInformacoesGerais = document.getElementById('incInformacoesGerais').checked; 
    const incInfraestrutura = document.getElementById('incInfraestrutura').checked;
    const generatedReportContent = document.getElementById('generatedReportContent');

    if (state.allLotes.length === 0) {
        generatedReportContent.textContent = "Nenhum dado de lotes disponível para gerar o relatório. Faça o upload das camadas primeiro.";
        return;
    }
    if (incInformacoesGerais && Object.keys(state.generalProjectInfo).length === 0) {
        generatedReportContent.textContent = "Seção 'Informações Gerais do Projeto' selecionada, mas nenhum dado foi salvo. Por favor, preencha e salve as informações na aba 'Informações Gerais'.";
        return;
    }

    let reportText = `RELATÓRIO GEOLAUDO.AI - ${reportType.toUpperCase()}\n`;
    reportText += `Data de Geração: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}\n\n`;

    let featuresToAnalyze = filteredLotes(); 
    let municipioDoNucleo = "Não informado"; 
    if (nucleosAnalise !== 'all' && nucleosAnalise !== 'none' && featuresToAnalyze.length > 0) {
        reportText += `Análise Focada no Núcleo: ${nucleosAnalise}\n\n`;
        municipioDoNucleo = featuresToAnalyze[0].properties?.nm_mun || featuresToAnalyze[0].properties?.municipio || "Não informado";
    } else {
        reportText += `Análise Abrangente (Todos os Núcleos)\n\n`;
        if (state.allLotes.length > 0) {
             municipioDoNucleo = state.allLotes[0].properties?.nm_mun || state.allLotes[0].properties?.municipio || "Não informado";
        }
    }

    // Busca dados IBGE simulados
    const dadosIbge = getSimulatedMunicipioData(municipioDoNucleo);
    if (dadosIbge && dadosIbge.municipio && dadosIbge.municipio !== "Não informado") {
        reportText += `--- Informações do Município (${dadosIbge.municipio}) ---\n`;
        reportText += `  - Região: ${dadosIbge.regiao}\n`;
        reportText += `  - População Estimada: ${dadosIbge.populacao}\n`;
        reportText += `  - Área Territorial: ${dadosIbge.area_km2} km²\n\n`;
    } else {
        reportText += `--- Informações do Município ---\n`;
        reportText += `  - Dados do município (${municipioDoNucleo}) não encontrados ou não informados nos lotes. (Simulado)\n\n`;
    }

    if (incDadosGerais) {
        reportText += `--- 1. Dados Gerais da Área Analisada ---\n`;
        reportText += `Total de Lotes Analisados: ${featuresToAnalyze.length}\n`;
        
        const totalArea = featuresToAnalyze.reduce((acc, f) => acc + (f.properties.area_m2 || 0), 0); 
        reportText += `Área Total dos Lotes: ${totalArea.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²\n\n`;

        const uniqueTiposUso = new Set(featuresToAnalyze.map(f => f.properties.tipo_uso).filter(Boolean));
        if (uniqueTiposUso.size > 0) {
            reportText += `Principais Tipos de Uso Identificados: ${Array.from(uniqueTiposUso).join(', ')}\n\n`;
        }
    }

    if (incAnaliseRiscos) {
        const riskCounts = { 'Baixo': 0, 'Médio': 0, 'Alto': 0, 'Muito Alto': 0 };
        featuresToAnalyze.forEach(f => {
            const risco = String(f.properties.risco || f.properties.status_risco || 'N/A').toLowerCase();
            if (risco.includes('baixo') || risco === '1') riskCounts['Baixo']++;
            else if (risco.includes('médio') || risco.includes('medio') || risco === '2') riskCounts['Médio']++;
            else if (risco.includes('alto') && !risco.includes('muito') || risco === '3') riskCounts['Alto']++;
            else if (risco.includes('muito alto') || risco === '4') riskCounts['Muito Alto']++;
        });
        const lotesComRiscoElevado = riskCounts['Médio'] + riskCounts['Alto'] + riskCounts['Muito Alto'];
        const percRiscoElevado = (lotesComRiscoElevado / featuresToAnalyze.length * 100 || 0).toFixed(2);

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
        const lotesEmAPP = featuresToAnalyze.filter(f => typeof f.properties.dentro_app === 'number' && f.properties.dentro_app > 0).length;
        reportText += `--- 3. Análise de Áreas de Preservação Permanente (APP) ---\n`;
        reportText += `Número de lotes que intersectam ou estão em APP: ${lotesEmAPP}\n`;
        if (lotesEmAPP > 0) {
            reportText += `Observação: A presença de lotes em Áreas de Preservação Permanente exige a aplicação de medidas específicas de regularização ambiental, como a recuperação da área degradada ou a compensação ambiental, conforme o Código Florestal e demais normativas ambientais aplicáveis à REURB.\n\n`;
        } else {
            reportText += `Observação: Não foram identificados lotes em Áreas de Preservação Permanente no conjunto de dados analisado, o que simplifica o licenciamento ambiental da regularização.\n\n`;
        }
    }

    if (incInformacoesGerais && Object.keys(state.generalProjectInfo).length > 0) {
        const info = state.generalProjectInfo; 

        reportText += `--- 4. Informações de Contexto Geral e Infraestrutura do Projeto ---\n`;
        
        reportText += `**Infraestrutura Básica:**\n`;
        reportText += `  - Unidades de Conservação Próximas: ${info.ucConservacao || 'Não informado'}.\n`;
        reportText += `  - Proteção de Mananciais na Área: ${info.protecaoMananciais || 'Não informado'}.\n`;
        reportText += `  - Abastecimento de Água: ${info.tipoAbastecimento || 'Não informado'}${info.responsavelAbastecimento ? ' (Responsável: ' + info.responsavelAbastecimento + ')' : ''}.\n`;
        reportText += `  - Coleta de Esgoto: ${info.tipoColetaEsgoto || 'Não informado'}${info.responsavelColetaEsgoto ? ' (Responsável: ' + info.responsavelColetaEsgoto + ')' : ''}.\n`;
        reportText += `  - Sistema de Drenagem: ${info.sistemaDrenagem || 'Não informado'}.\n`;
        reportText += `  - Lotes com Drenagem Inadequada: ${info.drenagemInadequada || 'Não informado'}.\n`;
        reportText += `  - Logradouros: ${info.logradourosIdentificados || 'Não informado'}.\n\n`;

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

        reportText += `**Ações e Medidas Propostas:**\n`;
        reportText += `  - Adequação para Correção de Desconformidades: ${info.adequacaoDesconformidades || 'Não informado'}.\n`;
        reportText += `  - Obras de Infraestrutura Essencial: ${info.obrasInfraestrutura || 'Não informado'}.\n`;
        reportText += `  - Medidas Compensatórias: ${info.medidasCompensatorias || 'Não informado'}.\n\n`;

        reportText += `Esta seção reflete informações gerais sobre a área do projeto, essenciais para uma análise contextualizada e para a tomada de decisões no processo de REURB.\n\n`;
    } else if (incInformacoesGerais) {
        reportText += `--- 4. Informações de Contexto Geral e Infraestrutura do Projeto ---\n`;
        reportText += `Nenhuma informação geral foi preenchida ou salva na aba 'Informações Gerais'. Por favor, preencha os dados e clique em 'Salvar Informações Gerais' antes de gerar o relatório com esta seção.\n\n`;
    }

    if (incInfraestrutura && state.layers.poligonais.getLayers().length > 0) { 
        reportText += `--- 5. Análise de Infraestrutura e Equipamentos Urbanos (Camadas Geoespaciais) ---\n`;
        reportText += `Foram detectadas ${state.layers.poligonais.getLayers().length} poligonais de infraestrutura ou outras áreas de interesse (como vias, áreas verdes, equipamentos comunitários) nas camadas carregadas.\n`;
        reportText += `A presença e adequação da infraestrutura existente é um fator chave para a viabilidade e qualidade da regularização. Recomenda-se verificação detalhada da situação da infraestrutura básica (água, esgoto, energia, drenagem, acesso) em relação aos lotes.\n\n`;
    }
    
    const custoTotalFiltrado = featuresToAnalyze.reduce((acc, f) => acc + (f.properties.valor || 0), 0); 
    reportText += `--- 6. Custo de Intervenção Estimado ---\n`;
    reportText += `Custo Total Estimado para Intervenção nos Lotes Analisados: R$ ${custoTotalFiltrado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    reportText += `Este valor é uma estimativa e deve ser refinado com levantamentos de campo e orçamentos detalhados.\n\n`;


    reportText += `--- Fim do Relatório ---\n`;
    reportText += `Este relatório foi gerado automaticamente pelo GeoLaudo.AI. Para análises mais aprofundadas e validação legal, consulte um especialista qualificado e os órgãos competentes.`;

    state.lastReportText = reportText; 
    generatedReportContent.textContent = reportText; 
    generatedReportContent.scrollTop = 0; 
}

// ===================== Funções de Inicialização Principal (Chamadas no DOMContentLoaded) =====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded: Página e DOM carregados. Iniciando componentes...'); 
    initMap(); 
    initNav(); 
    initUpload(); 
    initLegendToggles(); 
    initGeneralInfoForm(); 

    // Configura listeners para os botões principais (Aplicar Filtros, Gerar Relatório, Exportar Relatório)
    document.getElementById('applyFiltersBtn').addEventListener('click', () => {
        state.currentNucleusFilter = document.getElementById('nucleusFilter').value; 
        refreshDashboard();
        fillLotesTable();
        zoomToFilter();
    });

    document.getElementById('generateReportBtn').addEventListener('click', gerarRelatorioIA);

    document.getElementById('exportReportBtn').addEventListener('click', () => {
        if (!state.lastReportText.trim()) {
            alert('Nenhum relatório para exportar. Gere um relatório primeiro.');
            return;
        }
        downloadText('relatorio_geolaudo.txt', state.lastReportText);
    });
    
    // Configura listener para a mudança no select de filtros (para aplicar o zoom também)
    document.getElementById('nucleusFilter').addEventListener('change', () => {
        state.currentNucleusFilter = document.getElementById('nucleusFilter').value;
        refreshDashboard();
        fillLotesTable();
        zoomToFilter(); // Zoom quando o filtro muda no Dashboard
    });


    // Estado inicial: Dashboard ativo e preenchido (vazio no início)
    document.getElementById('dashboard').classList.add('active');
    document.querySelector('nav a[data-section="dashboard"]').classList.add('active');
    refreshDashboard(); 
    fillLotesTable(); 
    populateNucleusFilter(); 
    console.log('DOMContentLoaded: Configurações iniciais do app aplicadas.'); 
});
