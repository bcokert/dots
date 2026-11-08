-- Managed by dots (modules/editor/files/init.lua).
local opt, map = vim.opt, vim.keymap.set
vim.g.mapleader = ','

-- Display
opt.number = true
opt.cursorline = true
opt.list = true
opt.listchars = { tab = '▸ ', trail = '·', eol = '¬', nbsp = '_' }
opt.scrolloff = 4
opt.title = true
opt.mouse = 'a'
opt.autoread = true

-- Search: ignore case unless the pattern has a capital; :s replaces all matches by default
opt.ignorecase = true
opt.smartcase = true
opt.gdefault = true

-- Indent: 2 spaces
opt.expandtab = true
opt.tabstop = 2
opt.shiftwidth = 2
opt.smartindent = true

-- Undo history survives closing the file
opt.undofile = true

-- Clipboard: yank/put use the system clipboard. Over SSH there isn't one, so copy via OSC 52
-- (the terminal you're typing on puts it in *its* clipboard); paste from neovim's own register,
-- since most terminals don't allow reading the clipboard back.
opt.clipboard = 'unnamedplus'
if os.getenv('SSH_TTY') then
  local osc52 = require('vim.ui.clipboard.osc52')
  local function paste() return { vim.fn.split(vim.fn.getreg(''), '\n'), vim.fn.getregtype('') } end
  vim.g.clipboard = {
    name = 'OSC 52',
    copy = { ['+'] = osc52.copy('+'), ['*'] = osc52.copy('*') },
    paste = { ['+'] = paste, ['*'] = paste },
  }
end

-- Keys
map({ 'n', 'v' }, 'j', 'gj')   -- move through wrapped lines
map({ 'n', 'v' }, 'k', 'gk')
for _, key in ipairs({ 'h', 'j', 'k', 'l' }) do
  map('n', '<C-' .. key .. '>', '<C-w><C-' .. key .. '>')   -- Ctrl-hjkl between windows
end
map('n', '<leader>cd', '<cmd>cd %:p:h<cr><cmd>pwd<cr>')

local function strip_whitespace()
  local view = vim.fn.winsaveview()
  vim.cmd([[keeppatterns %s/\s\+$//e]])
  vim.fn.winrestview(view)
end
map('n', '<leader>ss', strip_whitespace)

-- Commands
vim.api.nvim_create_user_command('ClearSearch', function() vim.fn.setreg('/', '') end, {})
vim.api.nvim_create_user_command('FormatJSON', '%!jq .', {})

-- Autocommands
local group = vim.api.nvim_create_augroup('dots', {})
vim.api.nvim_create_autocmd('BufWritePre', { group = group, callback = strip_whitespace })
vim.api.nvim_create_autocmd('BufReadPost', {   -- reopen where you left off
  group = group,
  callback = function(args)
    local mark = vim.api.nvim_buf_get_mark(args.buf, '"')
    if mark[1] > 0 and mark[1] <= vim.api.nvim_buf_line_count(args.buf) then
      pcall(vim.api.nvim_win_set_cursor, 0, mark)
    end
  end,
})
