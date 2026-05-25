const fs = require('fs');
const content = fs.readFileSync('src/components/LandingPage.tsx', 'utf8');

const returnIndex = content.indexOf('  return (\n    <div className="flex h-screen');

if (returnIndex === -1) {
  console.error("Could not find the return statement");
  process.exit(1);
}

const topPreReturn = content.substring(0, returnIndex);

const newReturn = `  return (
    <div className="flex h-[100dvh] bg-[#FAFAFA] text-neutral-900 font-sans overflow-hidden relative">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 bottom-0 w-[5rem] bg-[#FAFAFA] border-r border-[#EFEFEF] z-[100] hidden md:flex flex-col items-center py-6 justify-between">
         <div className="flex flex-col items-center gap-6 w-full">
            <div className="w-10 h-10 flex items-center justify-center text-[#1A73E8] cursor-pointer" onClick={() => setActiveTab('home')}>
              {siteConfig?.logo ? <img src={siteConfig.logo} alt="Logo" className="w-8 h-8 object-contain" /> : <div className="w-8 h-8 rounded-lg bg-[#1A73E8] text-white flex items-center justify-center font-black">AI</div>}
            </div>
            <div className="flex flex-col items-center gap-3 w-full px-2 mt-4">
               <button onClick={() => setActiveTab('home')} className={\`flex flex-col items-center justify-center gap-1.5 w-14 h-[4.5rem] rounded-2xl transition-all \${activeTab === 'home' ? 'bg-[#E3F2FD] text-[#1A73E8]' : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'}\`}>
                 <Home className="w-[18px] h-[18px]" strokeWidth={2.5} />
                 <span className={\`text-[10px] tracking-wide \${activeTab === 'home' ? 'font-bold' : 'font-medium'}\`}>灵感</span>
               </button>
               <button onClick={() => setActiveTab('generation')} className={\`flex flex-col items-center justify-center gap-1.5 w-14 h-[4.5rem] rounded-2xl transition-all \${activeTab === 'generation' ? 'bg-[#E3F2FD] text-[#1A73E8]' : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'}\`}>
                 <Sparkles className="w-[18px] h-[18px]" strokeWidth={2.5} />
                 <span className="text-[10px] font-medium tracking-wide">生成</span>
               </button>
               <button onClick={() => setActiveTab('assets')} className={\`flex flex-col items-center justify-center gap-1.5 w-14 h-[4.5rem] rounded-2xl transition-all \${activeTab === 'assets' ? 'bg-[#E3F2FD] text-[#1A73E8]' : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'}\`}>
                 <LayoutGrid className="w-[18px] h-[18px]" strokeWidth={2.5} />
                 <span className="text-[10px] font-medium tracking-wide">资产</span>
               </button>
               <button onClick={() => handleProjectAction(onNewProject)} className="flex flex-col items-center justify-center gap-1.5 w-14 h-[4.5rem] rounded-2xl transition-all text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100">
                 <Maximize2 className="w-[18px] h-[18px]" strokeWidth={2.5} />
                 <span className="text-[10px] font-medium tracking-wide">画布</span>
               </button>
               <div className="w-8 h-[1px] bg-neutral-200/60 my-2" />
               <button className="flex flex-col items-center justify-center gap-1 w-14 h-14 rounded-2xl transition-all text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 group">
                 <div className="w-7 h-7 bg-black text-white rounded-[10px] flex items-center justify-center text-[8px] font-bold italic group-hover:scale-105 transition-transform shadow-[0_4px_10px_rgba(0,0,0,0.15)]">Octo</div>
                 <span className="text-[8px] text-[#1A73E8] font-bold bg-[#E3F2FD] px-1.5 py-0.5 rounded-sm">Beta</span>
               </button>
            </div>
         </div>
         
         <div className="flex flex-col items-center gap-4 w-full px-2">
            {user && (
              <div className="flex flex-col items-center gap-1 cursor-pointer w-full group" onClick={onOpenCredits}>
                 <div className="w-full flex items-center justify-center text-[#1A73E8] text-[10px] font-bold">
                    <Zap className="w-3 h-3 fill-current mr-0.5" /> 1.5万
                 </div>
                 <div className="text-[9px] text-[#1A73E8] bg-[#E3F2FD] px-1.5 rounded-sm py-0.5 font-bold scale-90 opacity-90 group-hover:opacity-100">高级会员</div>
              </div>
            )}
            {user ? (
               <button onClick={() => onOpenProfile()} className="w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-[0_2px_8px_rgba(0,0,0,0.1)] mt-2 hover:scale-105 transition-transform">
                  <img src={user.avatar || \`https://api.dicebear.com/7.x/avataaars/svg?seed=\${user.id}\`} className="w-full h-full object-cover" alt="" />
               </button>
            ) : (
               <button onClick={onLogin} className="w-10 h-10 rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center hover:bg-neutral-200 text-neutral-600 transition-colors mt-2">
                  <User className="w-4 h-4 text-inherit" />
               </button>
            )}
            <button className="w-12 h-10 rounded-xl flex items-center justify-center text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 relative transition-colors">
               <Bell className="w-[18px] h-[18px]" strokeWidth={2.5} />
               {unreadCount > 0 && <span className="absolute top-2.5 right-3.5 w-1.5 h-1.5 bg-red-500 rounded-full ring-2 ring-[#FAFAFA]" />}
            </button>
            <button className="w-12 h-10 rounded-xl flex items-center justify-center text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-colors">
               <BookText className="w-[18px] h-[18px]" strokeWidth={2.5} />
            </button>
            <button className="w-12 h-10 rounded-xl flex items-center justify-center text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-colors">
               <Menu className="w-[18px] h-[18px]" strokeWidth={2.5} />
            </button>
         </div>
      </div>
      
      {/* Main Content Area */}
      <main className="flex-1 md:ml-[5rem] flex flex-col overflow-y-auto overflow-x-hidden custom-scrollbar relative">
         <div className="w-full flex-shrink-0 pt-[8vh] md:pt-[12vh] pb-10 px-4 md:px-8 max-w-[1400px] mx-auto min-h-full">
            <h1 className="text-3xl md:text-[54px] font-bold text-neutral-900 mb-8 md:mb-12 tracking-tight flex items-center gap-2 select-none justify-center">
               开启你的 
               <span className="text-[#00BCD4] font-semibold cursor-pointer inline-flex items-center gap-1 mx-2 relative group pb-1 border-b-2 border-transparent hover:border-[#00BCD4] transition-colors">
                 Agent 模式
                 <ChevronDown className="w-5 h-5 md:w-8 md:h-8" />
               </span> 
               即可造梦！
            </h1>
            
            {/* Input Box */}
            <div className="w-full max-w-[840px] bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-neutral-100/50 p-2 md:p-3 flex flex-col transition-all focus-within:shadow-[0_8px_30px_rgba(0,0,0,0.08)] focus-within:border-neutral-200 mx-auto">
               <div className="flex w-full min-h-[60px] md:min-h-[80px]">
                  <div className="p-1 md:p-2">
                    <button className="w-10 h-10 md:w-12 md:h-12 bg-neutral-50 hover:bg-neutral-100 rounded-xl flex items-center justify-center text-neutral-400 hover:text-neutral-600 transition-colors">
                       <Plus className="w-5 h-5 md:w-6 md:h-6" strokeWidth={2} />
                    </button>
                  </div>
                  <textarea 
                    className="flex-1 bg-transparent resize-none outline-none p-3 md:p-4 text-sm md:text-[15px] text-neutral-800 placeholder:text-neutral-400/80 font-medium leading-relaxed custom-scrollbar"
                    placeholder="输入想法、剧本或上传参考，支持 “/” 使用技能，@ 添加主体，和 Agent一起创作"
                    rows={2}
                  />
               </div>
               
               <div className="flex items-center justify-between px-2 pb-1 md:pb-2 pt-2 md:pt-4 border-t border-neutral-50">
                  <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                    <button className="h-8 md:h-9 px-3 md:px-4 rounded-full bg-[#E0F7FA]/60 text-[#00BCD4] text-[11px] md:text-sm font-semibold flex items-center gap-1.5 transition-colors hover:bg-[#E0F7FA]">
                       <span className="italic font-black text-[10px]">///</span>
                       Agent 模式
                       <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    <button className="h-8 md:h-9 px-3 md:px-4 rounded-full bg-neutral-50 text-neutral-600 text-[11px] md:text-sm font-semibold flex items-center gap-1.5 transition-colors hover:bg-neutral-100">
                       <Settings className="w-3.5 h-3.5" />
                       自动
                    </button>
                    <button className="h-8 md:h-9 px-3 md:px-4 rounded-full bg-neutral-50 text-neutral-600 text-[11px] md:text-sm font-semibold flex items-center gap-1.5 transition-colors hover:bg-neutral-100">
                       <Zap className="w-3.5 h-3.5" />
                       使用技能
                    </button>
                    <button className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-neutral-50 flex items-center justify-center text-neutral-600 hover:bg-neutral-100 transition-colors">
                       <span className="font-bold text-sm">@</span>
                    </button>
                  </div>
                  <button className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-[#E5E5E5] flex items-center justify-center text-white hover:bg-neutral-400 transition-colors shadow-sm ml-2 shrink-0">
                     <ArrowUp className="w-4 h-4 md:w-5 md:h-5" strokeWidth={2.5} />
                  </button>
               </div>
            </div>
            
            {/* 5 Feature Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4 mt-8 md:mt-12 w-full max-w-[960px] mx-auto">
               {/* Card 1 */}
               <div className="bg-white rounded-2xl p-4 border border-neutral-100/60 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex items-center gap-3 md:gap-4 cursor-pointer hover:border-neutral-200 hover:shadow-md transition-all group">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-[10px] bg-black flex flex-shrink-0 items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform">
                     <span className="font-bold text-xs md:text-sm italic">Octo</span>
                  </div>
                  <div className="flex flex-col min-w-0 pr-1">
                     <span className="text-xs md:text-[14px] font-bold flex items-center gap-1.5 text-neutral-800">
                        Octo <span className="bg-[#E0F7FA] text-[#00BCD4] text-[9px] font-bold px-1.5 py-0.5 rounded-sm whitespace-nowrap">Beta</span>
                     </span>
                     <span className="text-[10px] md:text-[11px] text-neutral-400 mt-1 truncate">Vibe create, 创作自然生动</span>
                  </div>
               </div>
               {/* Card 2 */}
               <div className="bg-white rounded-2xl p-4 border border-neutral-100/60 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex items-center gap-3 md:gap-4 cursor-pointer hover:border-neutral-200 hover:shadow-md transition-all group" onClick={() => handleProjectAction(onNewProject)}>
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-[10px] bg-[#E3F2FD] flex flex-shrink-0 items-center justify-center text-[#1A73E8] shadow-sm group-hover:scale-105 transition-transform">
                     <Maximize2 className="w-5 h-5 md:w-6 md:h-6" strokeWidth={2} />
                  </div>
                  <div className="flex flex-col min-w-0 pr-1">
                     <span className="text-xs md:text-[14px] font-bold text-neutral-800">无限画布</span>
                     <span className="text-[10px] md:text-[11px] text-neutral-400 mt-1 truncate">自由创作</span>
                  </div>
               </div>
               {/* Card 3 */}
               <div className="bg-white rounded-2xl p-4 border border-neutral-100/60 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex items-center gap-3 md:gap-4 cursor-pointer hover:border-neutral-200 hover:shadow-md transition-all group">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-[10px] bg-[#E0F7FA] flex flex-shrink-0 items-center justify-center text-[#00BCD4] shadow-sm group-hover:scale-105 transition-transform">
                     <Sparkles className="w-5 h-5 md:w-6 md:h-6" fill="currentColor" />
                  </div>
                  <div className="flex flex-col min-w-0 pr-1">
                     <span className="text-xs md:text-[14px] font-bold text-neutral-800">Agent 模式</span>
                     <span className="text-[10px] md:text-[11px] text-neutral-400 mt-1 truncate">S2.0 视频创作</span>
                  </div>
               </div>
               {/* Card 4 */}
               <div className="bg-white rounded-2xl p-4 border border-neutral-100/60 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex items-center gap-3 md:gap-4 cursor-pointer hover:border-neutral-200 hover:shadow-md transition-all group">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-[10px] bg-[#E0F2F1] flex flex-shrink-0 items-center justify-center text-[#009688] shadow-sm group-hover:scale-105 transition-transform">
                     <ImageIcon className="w-5 h-5 md:w-6 md:h-6" strokeWidth={2} />
                  </div>
                  <div className="flex flex-col min-w-0 pr-1">
                     <span className="text-xs md:text-[14px] font-bold flex items-center gap-1.5 text-neutral-800">
                        图片生成 <span className="bg-[#E0F7FA] text-[#00BCD4] text-[9px] font-bold px-1.5 py-0.5 rounded-sm">4.1</span>
                     </span>
                     <span className="text-[10px] md:text-[11px] text-neutral-400 mt-1 truncate">智能美学提升</span>
                  </div>
               </div>
               {/* Card 5 */}
               <div className="bg-white rounded-2xl p-4 border border-neutral-100/60 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex items-center gap-3 md:gap-4 cursor-pointer hover:border-neutral-200 hover:shadow-md transition-all group lg:col-span-1 col-span-2 mx-auto lg:mx-0 w-full lg:w-auto max-w-[280px] lg:max-w-none">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-[10px] bg-[#1A73E8] flex flex-shrink-0 items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform">
                     <span className="font-bold text-[13px] md:text-[15px]">2.0</span>
                  </div>
                  <div className="flex flex-col min-w-0 pr-1">
                     <span className="text-xs md:text-[14px] font-bold text-neutral-800">视频生成</span>
                     <span className="text-[10px] md:text-[11px] text-neutral-400 mt-1 truncate">Seedance 2.0</span>
                  </div>
               </div>
            </div>
            
            <div className="w-full max-w-[1200px] mt-10 md:mt-16 mx-auto">
               {/* Discover Navbar */}
               <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-0 mb-8 border-b border-neutral-100/50 pb-4">
                  <div className="flex items-center gap-1">
                     <button className="px-5 md:px-6 py-2.5 bg-neutral-200/50 text-neutral-900 text-sm md:text-[15px] font-bold rounded-full transition-colors leading-none tracking-wide">
                        发现
                     </button>
                     <button className="px-5 md:px-6 py-2.5 text-neutral-500 hover:text-neutral-800 text-sm md:text-[15px] font-medium rounded-full transition-colors leading-none tracking-wide hover:bg-neutral-100/50">
                        短片
                     </button>
                     <button className="px-5 md:px-6 py-2.5 text-neutral-500 hover:text-neutral-800 text-sm md:text-[15px] font-medium rounded-full transition-colors leading-none tracking-wide hover:bg-neutral-100/50">
                        活动
                     </button>
                  </div>
                  
                  <div className="relative w-full md:w-[260px] group">
                     <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-[#1A73E8] transition-colors" />
                     <input 
                        type="text" 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="game" 
                        className="w-full pl-[36px] pr-4 py-2 bg-white border border-neutral-200 rounded-full text-sm outline-none focus:border-[#1A73E8] focus:ring-4 focus:ring-[#1A73E8]/10 transition-all font-medium placeholder:font-medium placeholder:text-neutral-400 shadow-sm" 
                     />
                  </div>
               </div>
               
               {/* Masonry / Posts Grid */}
               <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-3 md:gap-4 space-y-3 md:space-y-4">
                  {isCommunityLoading ? (
                     Array.from({ length: 15 }).map((_, idx) => (
                        <div key={idx} className="break-inside-avoid aspect-[3/4] bg-neutral-100 rounded-2xl animate-pulse" style={{ height: \`\${Math.random() * 100 + 200}px\` }} />
                     ))
                  ) : sortedCommunityPosts.length > 0 ? (
                     sortedCommunityPosts.map((post) => (
                        <div key={post.id} className="break-inside-avoid group relative rounded-2xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow border border-neutral-100/60">
                           <CommunityPostCard onLogin={onLogin} 
                              post={post}
                              user={user}
                              onView={() => setViewingPost({...post, _contextList: sortedCommunityPosts})}
                              onProfileOpen={(id) => setShowPublicProfile(id)}
                              onLike={handleLike}
                              onPurchase={handlePurchaseProject}
                           />
                        </div>
                     ))
                  ) : (
                     <div className="col-span-full py-32 flex flex-col items-center justify-center text-center">
                        <div className="w-20 h-20 bg-neutral-100 rounded-full flex items-center justify-center mb-6">
                           <Search className="w-8 h-8 text-neutral-400" />
                        </div>
                        <p className="text-neutral-800 font-bold text-lg">未找到匹配的结果</p>
                        <p className="text-neutral-500 mt-2 text-sm">尝试调整搜索关键词或选择其他分类</p>
                     </div>
                  )}
               </div>
            </div>
         </div>
      </main>
      
      {/* Modals & Alerts */}
      {projectToRename && onRenameProject && (
        <RenameProjectModal
          initialName={projectToRename.name}
          onClose={() => setProjectToRename(null)}
          onConfirm={(newName) => {
            onRenameProject(projectToRename.id, newName);
            setProjectToRename(null);
          }}
        />
      )}

      {showUploadModal && (
        <UploadPostModal 
          onClose={() => setShowUploadModal(false)}
          onSuccess={() => {
            setShowUploadModal(false);
            fetchCommunityPosts();
          }}
          currentProjectData={localStorage.getItem('ais-nodes') ? {
            nodes: JSON.parse(localStorage.getItem('ais-nodes') || '[]'),
            edges: JSON.parse(localStorage.getItem('ais-edges') || '[]')
          } : null}
          projects={projects}
          currentProjectId={currentProjectId}
        />
      )}

      <AnimatePresence>
        {showDesktopWarning && (
          <div 
            className="fixed inset-0 z-[200000] flex items-center justify-center p-6 bg-white/80 "
            onClick={() => setShowDesktopWarning(false)}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white border border-black/10 rounded-[30px] p-6 max-w-[280px] w-full text-center shadow-xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-black/20" />
              <div className="w-14 h-14 bg-black/5 rounded-md flex items-center justify-center mx-auto mb-4 border border-black/10">
                <Monitor className="w-7 h-7 text-neutral-900" />
              </div>
              <h3 className="text-lg font-black text-neutral-900 mb-2 uppercase tracking-tighter">进入完整工作台</h3>
              <p className="text-[11px] text-neutral-600 leading-relaxed mb-6 font-bold uppercase tracking-widest">
                已为桌面开发机优化。请通过浏览器访问以发布创意素材。
              </p>
              <Button 
                onClick={() => setShowDesktopWarning(false)}
                className="w-full h-11 bg-white text-black hover:bg-neutral-200 rounded-md font-black text-xs uppercase tracking-widest shadow-lg transition-all active:scale-95"
              >
                我知道了
              </Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* Mobile Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-[101] bg-white border-t border-neutral-200 px-2 flex items-center justify-around md:hidden pb-safe">
         <button onClick={() => setActiveTab('home')} className={\`flex-1 flex flex-col items-center justify-center py-2 gap-1 \${activeTab === 'home' ? 'text-[#1A73E8]' : 'text-neutral-500'}\`}>
            <Home className="w-[22px] h-[22px]" strokeWidth={activeTab === 'home' ? 2.5 : 2} />
            <span className={\`text-[10px] \${activeTab === 'home' ? 'font-bold' : 'font-medium'}\`}>主页</span>
         </button>
         <button onClick={() => setActiveTab('generation')} className={\`flex-1 flex flex-col items-center justify-center py-2 gap-1 \${activeTab === 'generation' ? 'text-[#1A73E8]' : 'text-neutral-500'}\`}>
            <Sparkles className="w-[22px] h-[22px]" strokeWidth={activeTab === 'generation' ? 2.5 : 2} />
            <span className={\`text-[10px] \${activeTab === 'generation' ? 'font-bold' : 'font-medium'}\`}>生成</span>
         </button>
         <button onClick={() => handleProjectAction(onNewProject)} className="flex-[0.8] -mt-6">
            <div className="w-12 h-12 rounded-full bg-black text-white flex items-center justify-center shadow-lg mx-auto">
               <Plus className="w-6 h-6" />
            </div>
         </button>
         <button className="flex-1 flex flex-col items-center justify-center py-2 gap-1 text-neutral-500">
            <Bell className="w-[22px] h-[22px]" strokeWidth={2} />
            <span className="text-[10px] font-medium">消息</span>
         </button>
         <button onClick={user ? () => onOpenProfile() : onLogin} className="flex-1 flex flex-col items-center justify-center py-2 gap-1 text-neutral-500">
            <User className="w-[22px] h-[22px]" strokeWidth={2} />
            <span className="text-[10px] font-medium">我的</span>
         </button>
      </div>
    </div>
  );
}
`;

fs.writeFileSync('src/components/LandingPage.tsx', topPreReturn + newReturn, 'utf8');
