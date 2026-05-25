const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');
const startIndex = code.indexOf('<Panel position="top-left" className="ml-2 md:ml-6');
if (startIndex === -1) { console.error('not found'); process.exit(1); }
const endIndex = code.indexOf('</Panel>', startIndex) + '</Panel>'.length;

const replacement = `                  <Panel position="top-left" className="ml-2 md:ml-6 mt-2 md:mt-4 z-50 overflow-visible">
                    <div className="group relative">
                      <button 
                        className="w-10 h-10 md:w-12 md:h-12 bg-[#1E1E1E]/80 backdrop-blur-md rounded-full border border-white/20 flex flex-col items-center justify-center shadow-lg transition-all duration-300 hover:bg-[#282828] hover:border-white/40 overflow-hidden group-hover:bg-[#282828] group-hover:border-white/60 group-hover:shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                        onClick={() => window.location.href = '/'}
                        title="返回首页"
                      >
                        <Logo className="w-5 h-5 md:w-6 md:h-6 text-white" url={siteConfig?.logoUrl} />
                      </button>

                      <div className="absolute top-full left-0 pt-3 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-300 -translate-y-2 group-hover:translate-y-0 w-10 md:w-12 pb-8">
                        <div className="bg-[#1E1E1E]/95 backdrop-blur-md p-1 md:p-1.5 rounded-[24px] shadow-2xl border border-white/20 flex flex-col items-center gap-0.5 md:gap-1 relative z-50">
                          
                          {/* 个人中心 */}
                          <button 
                            className="flex flex-col items-center justify-center w-10 h-10 rounded-full text-[8px] md:text-[10px] font-black transition-all duration-200 bg-transparent text-neutral-400 hover:bg-[#333] hover:text-white uppercase tracking-tighter"
                            onClick={() => {
                              if (user) {
                                const nextState = !showUserMenu;
                                if (nextState) {
                                  setShowTransferMenu(false);
                                  setPaneContextMenu(null);
                                  setShowLayoutMenu(false);
                                }
                                setShowUserMenu(nextState);
                              } else {
                                setShowAuthModal(true);
                              }
                            }} 
                            title={user ? \`个人中心: \${user.username}\` : "身份验证"}
                          >
                            <User className={\`w-3.5 h-3.5 mb-0.5 \${user ? 'text-blue-400' : ''}\`} />
                            <span className="text-[8px] uppercase font-black tracking-widest scale-90">{user ? '个人中心' : '验证'}</span>
                          </button>

                          <div className="h-px w-6 bg-white/10 mx-auto my-0.5" />

                          {/* 面板 */}
                          <div className="relative group/folder w-full flex justify-center">
                            <button 
                              className={\`flex flex-col items-center justify-center w-10 h-10 rounded-full text-[8px] md:text-[10px] font-black transition-all duration-200 uppercase tracking-tighter \${showLayoutMenu ? 'bg-[#333] text-white' : 'bg-transparent text-neutral-400 hover:bg-[#333] hover:text-white'}\`}
                              onClick={() => {
                                const nextState = !showLayoutMenu;
                                if (nextState) {
                                  setShowUserMenu(false);
                                  setPaneContextMenu(null);
                                  setShowTransferMenu(false);
                                }
                                setShowLayoutMenu(nextState);
                              }}
                              title="面板排列"
                            >
                              <LayoutGrid className="w-3.5 h-3.5 mb-0.5" />
                              <span className="text-[8px] uppercase font-black tracking-widest scale-90">面板</span>
                            </button>
                            
                            {showLayoutMenu && (
                              <div className="absolute left-full ml-3 top-0 bg-[#1E1E1E]/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl p-1.5 w-28 flex flex-col gap-1 z-[60] animate-in fade-in slide-in-from-left-4 duration-200" onClick={(e) => e.stopPropagation()}>
                                <button 
                                  className="w-full flex items-center justify-center gap-2 p-2 rounded-lg text-[10px] font-black tracking-widest text-neutral-300 hover:bg-white/10 hover:text-white transition-all whitespace-nowrap"
                                  onClick={() => { onLayout('TB'); setShowLayoutMenu(false); }}
                                >
                                  <AlignVerticalSpaceAround className="w-3.5 h-3.5" />自上而下
                                </button>
                                <button 
                                  className="w-full flex items-center justify-center gap-2 p-2 rounded-lg text-[10px] font-black tracking-widest text-neutral-300 hover:bg-white/10 hover:text-white transition-all whitespace-nowrap"
                                  onClick={() => { onLayout('LR'); setShowLayoutMenu(false); }}
                                >
                                  <AlignHorizontalSpaceAround className="w-3.5 h-3.5" />自左向右
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="h-px w-6 bg-white/10 mx-auto my-0.5" />

                          {/* 选择 */}
                          <button 
                            className={\`flex flex-col items-center justify-center w-10 h-10 rounded-full text-[8px] md:text-[10px] font-black transition-all duration-200 uppercase tracking-tighter \${isSelectMode ? 'bg-blue-500/20 text-blue-400' : 'bg-transparent text-neutral-400 hover:bg-[#333] hover:text-white'}\`}
                            onClick={() => setIsSelectMode(!isSelectMode)}
                            title={isSelectMode ? "平移模式" : "框选模式"}
                          >
                            {isSelectMode ? <MousePointer2 className="w-3.5 h-3.5 mb-0.5" /> : <Hand className="w-3.5 h-3.5 mb-0.5" />}
                            <span className="text-[8px] uppercase font-black tracking-widest scale-90">选择</span>
                          </button>

                          <div className="h-px w-6 bg-white/10 mx-auto my-0.5" />

                          {/* 脚本 */}
                          <button 
                            className="flex flex-col items-center justify-center w-10 h-10 rounded-full text-[8px] md:text-[10px] font-black transition-all duration-200 bg-transparent text-neutral-400 hover:bg-[#333] hover:text-white uppercase tracking-tighter"
                            onClick={() => setShowScriptModal(true)}
                            title="打开剧本编辑器"
                          >
                            <FileText className="w-3.5 h-3.5 mb-0.5" />
                            <span className="text-[8px] uppercase font-black tracking-widest scale-90">脚本</span>
                          </button>

                          <div className="h-px w-6 bg-white/10 mx-auto my-0.5" />

                          {/* 上行 */}
                          <button 
                            className="flex flex-col items-center justify-center w-10 h-10 rounded-full text-[8px] md:text-[10px] font-black transition-all duration-200 bg-transparent text-neutral-400 hover:bg-[#333] hover:text-white uppercase tracking-tighter"
                            onClick={() => document.getElementById('canvas-media-upload')?.click()}
                            title="上传媒体"
                          >
                            <Upload className="w-3.5 h-3.5 mb-0.5" />
                            <span className="text-[8px] uppercase font-black tracking-widest scale-90">上行</span>
                          </button>
                          <input 
                            type="file" 
                            id="canvas-media-upload" 
                            className="hidden" 
                            multiple 
                            accept="image/*,video/*,image/gif,video/mp4,video/quicktime,video/webm" 
                            onChange={handleCanvasMediaUpload} 
                          />

                          <div className="h-px w-6 bg-white/10 mx-auto my-0.5" />

                          {/* 工程 (原 文件) */}
                          <div className="relative group/folder w-full flex justify-center">
                            <button 
                              className={\`flex flex-col items-center justify-center w-10 h-10 rounded-full text-[8px] md:text-[10px] font-black transition-all duration-200 uppercase tracking-tighter \${showTransferMenu ? 'bg-[#333] text-white' : 'bg-transparent text-neutral-400 hover:bg-[#333] hover:text-white'}\`}
                              onClick={() => {
                                const nextState = !showTransferMenu;
                                if (nextState) {
                                  setShowUserMenu(false);
                                  setPaneContextMenu(null);
                                  setShowLayoutMenu(false);
                                }
                                setShowTransferMenu(nextState);
                              }} 
                              title="磁盘读写"
                            >
                              <Download className="w-3.5 h-3.5 mb-0.5" />
                              <span className="text-[8px] scale-90 font-black tracking-widest uppercase">工程</span>
                            </button>
                            
                            {showTransferMenu && (
                              <div 
                                className="absolute left-full ml-3 top-0 bg-[#1E1E1E]/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl p-1.5 w-28 flex flex-col gap-1 z-[60] animate-in fade-in slide-in-from-left-4 duration-200"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button 
                                  className="w-full flex items-center justify-center gap-2 p-2 rounded-lg text-[10px] font-black tracking-widest text-neutral-300 hover:bg-white/10 hover:text-white transition-all whitespace-nowrap"
                                  onClick={() => { handleSaveProject(); setShowTransferMenu(false); }}
                                >
                                  <Download className="w-3.5 h-3.5" />导出工程
                                </button>
                                <button 
                                  className="w-full flex items-center justify-center gap-2 p-2 rounded-lg text-[10px] font-black tracking-widest text-neutral-300 hover:bg-white/10 hover:text-white transition-all whitespace-nowrap"
                                  onClick={() => { document.getElementById('project-load-input')?.click(); }}
                                >
                                  <Upload className="w-3.5 h-3.5" />导入工程
                                </button>
                                <input type="file" id="project-load-input" className="hidden" accept=".aiswork" onChange={(e: any) => { handleLoadProject(e); setShowTransferMenu(false); }} />
                              </div>
                            )}
                          </div>

                          <div className="h-px w-6 bg-white/10 mx-auto my-0.5" />

                          {/* 吸附 */}
                          <button 
                            className="flex flex-col items-center justify-center w-10 h-10 rounded-full text-[8px] md:text-[10px] font-black transition-all duration-200 bg-transparent text-neutral-400 hover:bg-[#333] hover:text-white uppercase tracking-tighter"
                            onClick={() => setSnapToGrid(!snapToGrid)}
                            title={snapToGrid ? "禁用网格吸附" : "启用网格吸附"}
                          >
                            <Grid className={\`w-3.5 h-3.5 mb-0.5 \${snapToGrid ? 'text-blue-400' : ''}\`} />
                            <span className="text-[8px] uppercase font-black tracking-widest scale-90">吸附</span>
                          </button>

                          <div className="h-px w-6 bg-white/10 mx-auto my-0.5" />

                          {/* 色度 */}
                          <div 
                            className="relative flex flex-col items-center justify-center w-10 h-10 rounded-full text-[8px] md:text-[10px] font-black transition-all duration-200 bg-transparent text-neutral-400 hover:bg-[#333] hover:text-white overflow-hidden uppercase tracking-tighter"
                            title="核心色调"
                          >
                            <Palette className="w-3.5 h-3.5 mb-0.5" />
                            <span className="text-[8px] uppercase font-black tracking-widest scale-90">色度</span>
                            <input 
                              type="color" 
                              value={canvasColor}
                              onChange={(e) => setCanvasColor(e.target.value)}
                              className="absolute inset-0 opacity-0 cursor-pointer w-[200%] h-[200%] -top-1/2 -left-1/2"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </Panel>`;

code = code.substring(0, startIndex) + replacement + code.substring(endIndex);
fs.writeFileSync('src/App.tsx', code);
console.log('replaced');
