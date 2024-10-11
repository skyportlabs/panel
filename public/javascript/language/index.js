function updateSelectedFlag() {
    const select = document.getElementById('language-selector');
    const selectedFlag = document.getElementById('selected-flag');
    if(selectedFlag) {
        selectedFlag.className = `flag-icon flag-icon-${select.value}`;
     }
  }

  document.addEventListener('DOMContentLoaded', updateSelectedFlag);


function changeLanguage(lang) {
    fetch(`/setLanguage?lang=${lang}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                location.reload();
            } else {
                alert('Failed to change language');
            }
        });
}

