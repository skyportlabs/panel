const searchModal = document.getElementById('searchModal');
const modalContent = document.querySelector('.modal-content');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const navLinks = document.querySelectorAll('.nav-link');
let selected = '';

function filterLinks(searchTerm) {
  const filteredLinks = Array.from(navLinks).filter((link) => {
    const textMatch = link.textContent.toLowerCase().includes(searchTerm);
    const searchDataMatch = link.getAttribute('searchdata')?.toLowerCase().includes(searchTerm);
    return textMatch || searchDataMatch;
  });

  searchResults.innerHTML = '';

  if (filteredLinks.length === 0) {
    const noResultsMessage = document.createElement('p');
    noResultsMessage.textContent = 'No results found.';
    noResultsMessage.classList.add('text-gray-400', 'text-sm', 'mt-4');
    searchResults.appendChild(noResultsMessage);
  } else {
    filteredLinks.forEach((link, index) => {
      const resultLink = document.createElement('a');
      resultLink.href = link.href;
      resultLink.textContent = link.textContent;
      resultLink.classList.add(
        'nav-link',
        'transition',
        'text-gray-600',
        'hover:bg-gray-200',
        'backdrop-blur',
        'hover:text-gray-800',
        'group',
        'flex',
        'items-center',
        'px-4',
        'py-2',
        'text-sm',
        'font-medium',
        'rounded-lg',
      );

      if (index === 0) {
        selected = resultLink.href;
        resultLink.classList.add('bg-gray-200', 'text-gray-900', 'font-semibold', 'searchLinkActive', 'mt-4');
      }

      searchResults.appendChild(resultLink);
    });
  }
}

filterLinks('');

document.addEventListener('keydown', (event) => {
  if (event.key === '/') {
    event.preventDefault();
    searchModal.classList.add('show');
    setTimeout(() => {
      modalContent.classList.add('visible');
      searchInput.focus();
    }, 50);
  }
});

window.addEventListener('click', (event) => {
  if (event.target === searchModal) {
    modalContent.classList.remove('visible');
    setTimeout(() => {
      searchModal.classList.remove('show');
    }, 300);
  }
});

searchInput.addEventListener('input', () => {
  const searchTerm = searchInput.value.toLowerCase();
  filterLinks(searchTerm);
});

searchInput.addEventListener("keypress", function(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    const selectedLink = searchResults.querySelector('.searchLinkActive');
    if (selectedLink) {
      selectedLink.click();
    }
  }
});
