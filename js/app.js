// ===================== Filtros por Núcleo =====================
function populateNucleusFilter() {
    console.log('populateNucleusFilter: Preenchendo filtro de núcleos com:', Array.from(state.nucleusSet)); 
    const filterSelect = document.getElementById('nucleusFilter');
    const reportNucleosSelect = document.getElementById('nucleosAnalise');

    // Verifica se os elementos existem antes de tentar usá-los
    if (!filterSelect || !reportNucleosSelect) {
        console.error("Um ou mais elementos de filtro ('nucleusFilter' ou 'nucleosAnalise') não foram encontrados no HTML.");
        return; // Sai da função para evitar mais erros
    }
    
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
