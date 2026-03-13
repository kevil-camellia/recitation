const { createApp, ref, reactive, computed, onMounted } = Vue;

const app = createApp({
  setup() {
    // 数据状态
    const currentSubject = ref('');
    const currentQuestion = ref(null);
    
    // 持久化数据
    const userEdits = reactive(JSON.parse(localStorage.getItem('userEdits') || '{}'));
    const userProgress = reactive(JSON.parse(localStorage.getItem('userProgress') || '{}'));
    const userNotes = reactive(JSON.parse(localStorage.getItem('userNotes') || '{}'));
    const userPractice = reactive(JSON.parse(localStorage.getItem('userPractice') || '{}'));
    const userAddedData = reactive(JSON.parse(localStorage.getItem('userAddedData') || '{}'));

    // UI 状态
    const searchText = ref('');
    const showOnlyWrong = ref(false);
    const showAnswer = ref(false);
    const isEditing = ref(false);
    const editForm = reactive({ q: '', a: '', note: '' });
    
    // 批量添加题目状态
    const showAddModal = ref(false);
    const batchText = ref('');

    // 动态计算科目列表（合并默认题库和用户添加的题库）
    const subjects = computed(() => {
      const baseSubs = Object.keys(window.myData || {});
      const addedSubs = Object.keys(userAddedData);
      return [...new Set([...baseSubs, ...addedSubs])];
    });

    // 初始化
    onMounted(() => {
      if (subjects.value.length > 0) {
        selectSubject(subjects.value[0]);
      }
    });
    
    // 保存数据到 localStorage
    const saveData = () => {
      localStorage.setItem('userEdits', JSON.stringify(userEdits));
      localStorage.setItem('userProgress', JSON.stringify(userProgress));
      localStorage.setItem('userNotes', JSON.stringify(userNotes));
      localStorage.setItem('userPractice', JSON.stringify(userPractice));
      localStorage.setItem('userAddedData', JSON.stringify(userAddedData));
    };
    
    // 导出备份
    const exportBackup = () => {
      const backupData = {
        userEdits,
        userProgress,
        userNotes,
        userPractice,
        userAddedData
      };
      
      const dataStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `recite_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      ElementPlus.ElMessage.success('备份已导出');
    };

    // 导入备份
    const importBackup = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = JSON.parse(event.target.result);
            
            if (data.userAddedData) Object.assign(userAddedData, data.userAddedData);
            if (data.userEdits) Object.assign(userEdits, data.userEdits);
            if (data.userProgress) Object.assign(userProgress, data.userProgress);
            if (data.userNotes) Object.assign(userNotes, data.userNotes);
            if (data.userPractice) Object.assign(userPractice, data.userPractice);
            
            // 刷新科目列表
            const addedSubs = Object.keys(userAddedData);
            const baseSubs = Object.keys(window.myData);
            subjects.value = [...new Set([...baseSubs, ...addedSubs])];
            
            saveData();
            ElementPlus.ElMessage.success('备份导入成功');
            
            // 重新选择当前科目以刷新列表
            if (currentSubject.value) {
              const temp = currentSubject.value;
              currentSubject.value = '';
              setTimeout(() => selectSubject(temp), 10);
            } else if (subjects.value.length > 0) {
              selectSubject(subjects.value[0]);
            }
          } catch (error) {
            console.error('导入失败:', error);
            ElementPlus.ElMessage.error('导入失败，请检查文件格式是否正确');
          }
        };
        reader.readAsText(file);
      };
      
      input.click();
    };

    // 合并题库与用户修改
    const mergedQuestions = computed(() => {
      if (!currentSubject.value) return [];
      const baseQuestions = window.myData[currentSubject.value] || [];
      const addedQuestions = userAddedData[currentSubject.value] || [];
      const allQuestions = [...baseQuestions, ...addedQuestions];
      
      const edits = userEdits[currentSubject.value] || {};
      const progress = userProgress[currentSubject.value] || {};
      
      return allQuestions.map(q => {
        const edit = edits[q.id] || {};
        const prog = progress[q.id] || { mastery: '', wrong: false, finished: false, reviewCount: 0 };
        // 确保 reviewCount 存在
        if (prog.reviewCount === undefined) prog.reviewCount = 0;
        return {
          ...q,
          ...edit,
          progress: prog
        };
      }).filter(q => !q.deleted); // 过滤掉被删除的题目
    });

    // 过滤题目
    const filteredQuestions = computed(() => {
      let list = mergedQuestions.value;
      
      if (showOnlyWrong.value) {
        list = list.filter(q => q.progress.wrong);
      }
      
      if (searchText.value) {
        const kw = searchText.value.toLowerCase();
        list = list.filter(q => 
          (q.q && q.q.toLowerCase().includes(kw)) || 
          (q.a && q.a.toLowerCase().includes(kw)) || 
          (q.note && q.note.toLowerCase().includes(kw))
        );
      }
      
      return list;
    });

    // 科目进度
    const subjectProgress = computed(() => {
      const res = {};
      subjects.value.forEach(sub => {
        const base = window.myData[sub] || [];
        const added = userAddedData[sub] || [];
        const totalQuestions = [...base, ...added];
        
        const edits = userEdits[sub] || {};
        const activeQuestions = totalQuestions.filter(q => !(edits[q.id] && edits[q.id].deleted));
        
        const prog = userProgress[sub] || {};
        const finishedCount = activeQuestions.filter(q => prog[q.id] && prog[q.id].finished).length;
        res[sub] = { finished: finishedCount, total: activeQuestions.length };
      });
      return res;
    });

    // 切换科目
    const selectSubject = (sub) => {
      if (currentSubject.value === sub) return;
      currentSubject.value = sub;
      searchText.value = '';
      showOnlyWrong.value = false;
      currentQuestion.value = null; // 切换科目时清空当前题目，触发动画
      
      setTimeout(() => {
        if (filteredQuestions.value.length > 0) {
          selectQuestion(filteredQuestions.value[0]);
        }
      }, 50);
    };

    // 切换题目
    const selectQuestion = (q) => {
      // 触发过渡动画，先置空再赋值
      if (currentQuestion.value && currentQuestion.value.id !== q.id) {
        currentQuestion.value = null;
        setTimeout(() => {
          const latestQ = mergedQuestions.value.find(item => item.id === q.id);
          currentQuestion.value = latestQ || q;
          showAnswer.value = false;
          isEditing.value = false;
        }, 150); // 与 CSS transition 时间匹配
      } else {
        const latestQ = mergedQuestions.value.find(item => item.id === q.id);
        currentQuestion.value = latestQ || q;
        showAnswer.value = false;
        isEditing.value = false;
      }
    };

    // 添加科目
    const addSubject = () => {
      ElementPlus.ElMessageBox.prompt('请输入新科目名称', '添加科目', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPattern: /\S+/,
        inputErrorMessage: '科目名称不能为空'
      }).then(({ value }) => {
        const subName = value.trim();
        if (!userAddedData[subName] && !window.myData[subName]) {
          userAddedData[subName] = [];
          saveData();
          selectSubject(subName);
          ElementPlus.ElMessage.success('科目添加成功');
        } else {
          ElementPlus.ElMessage.warning('该科目已存在');
        }
      }).catch(() => {});
    };

    // 批量添加题目
    const confirmAddQuestions = () => {
      if (!batchText.value.trim()) return;
      
      const blocks = batchText.value.split(/问题：|问题:/).filter(b => b.trim());
      let addedCount = 0;
      const sub = currentSubject.value;
      
      if (!userAddedData[sub]) {
        userAddedData[sub] = [];
      }
      
      blocks.forEach(block => {
        const parts = block.split(/答案：|答案:/);
        if (parts.length >= 2) {
          const qText = parts[0].trim();
          const aText = parts.slice(1).join('答案：').trim();
          
          userAddedData[sub].push({
            id: 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            q: qText,
            a: aText,
            note: ''
          });
          addedCount++;
        }
      });
      
      if (addedCount > 0) {
        saveData();
        ElementPlus.ElMessage.success(`成功添加 ${addedCount} 道题目`);
        showAddModal.value = false;
        batchText.value = '';
        
        // 如果当前没有选中题目，选中新添加的第一题
        if (!currentQuestion.value && filteredQuestions.value.length > 0) {
          selectQuestion(filteredQuestions.value[0]);
        }
      } else {
        ElementPlus.ElMessage.warning('未识别到有效题目，请检查格式（需要包含"问题："和"答案："）');
      }
    };

    // 删除题目
    const deleteQuestion = () => {
      if (!currentQuestion.value) return;
      
      ElementPlus.ElMessageBox.confirm('确定要删除这道题目吗？', '删除确认', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'danger'
      }).then(() => {
        const qId = currentQuestion.value.id;
        const sub = currentSubject.value;
        
        // 标记为已删除
        if (!userEdits[sub]) userEdits[sub] = {};
        userEdits[sub][qId] = { ...userEdits[sub][qId], deleted: true };
        
        // 如果是用户自己添加的题目，也可以直接从 userAddedData 中移除
        if (userAddedData[sub]) {
          const idx = userAddedData[sub].findIndex(q => q.id === qId);
          if (idx !== -1) {
            userAddedData[sub].splice(idx, 1);
          }
        }
        
        saveData();
        ElementPlus.ElMessage.success('删除成功');
        currentQuestion.value = null;
        
        // 自动选中下一题
        setTimeout(() => {
          if (filteredQuestions.value.length > 0) {
            selectQuestion(filteredQuestions.value[0]);
          }
        }, 150);
      }).catch(() => {});
    };

    // 更新进度
    const updateProgress = (qId, key, value) => {
      const sub = currentSubject.value;
      if (!userProgress[sub]) userProgress[sub] = {};
      if (!userProgress[sub][qId]) userProgress[sub][qId] = { mastery: '', wrong: false, finished: false, reviewCount: 0 };
      
      userProgress[sub][qId][key] = value;
      saveData();
      
      if (currentQuestion.value && currentQuestion.value.id === qId) {
        currentQuestion.value.progress[key] = value;
      }
    };

    const toggleWrong = () => {
      if (!currentQuestion.value) return;
      const qId = currentQuestion.value.id;
      const current = currentQuestion.value.progress.wrong;
      updateProgress(qId, 'wrong', !current);
    };

    const setMastery = (level) => {
      if (!currentQuestion.value) return;
      const qId = currentQuestion.value.id;
      updateProgress(qId, 'mastery', level);
      updateProgress(qId, 'finished', true);
    };
    
    // 增加背书次数
    const incrementReviewCount = () => {
      if (!currentQuestion.value) return;
      const qId = currentQuestion.value.id;
      const currentCount = currentQuestion.value.progress.reviewCount || 0;
      updateProgress(qId, 'reviewCount', currentCount + 1);
      ElementPlus.ElMessage.success('背书次数 +1');
    };

    // 修改背书次数
    const updateReviewCount = (newVal) => {
      if (!currentQuestion.value) return;
      const count = newVal || 0;
      const qId = currentQuestion.value.id;
      updateProgress(qId, 'reviewCount', count);
      ElementPlus.ElMessage.success(`背书次数已修改为 ${count}`);
    };

    // 练习与笔记双向绑定
    const currentPractice = computed({
      get: () => {
        if (!currentSubject.value || !currentQuestion.value) return '';
        const key = `${currentSubject.value}_${currentQuestion.value.id}`;
        return userPractice[key] || '';
      },
      set: (val) => {
        if (!currentSubject.value || !currentQuestion.value) return;
        const key = `${currentSubject.value}_${currentQuestion.value.id}`;
        userPractice[key] = val;
        saveData();
      }
    });

    const currentNote = computed({
      get: () => {
        if (!currentSubject.value || !currentQuestion.value) return '';
        const key = `${currentSubject.value}_${currentQuestion.value.id}`;
        return userNotes[key] || '';
      },
      set: (val) => {
        if (!currentSubject.value || !currentQuestion.value) return;
        const key = `${currentSubject.value}_${currentQuestion.value.id}`;
        userNotes[key] = val;
        saveData();
      }
    });

    // 编辑题目
    const startEdit = () => {
      if (!currentQuestion.value) return;
      editForm.q = currentQuestion.value.q;
      editForm.a = currentQuestion.value.a;
      editForm.note = currentQuestion.value.note;
      isEditing.value = true;
    };

    const saveEdit = () => {
      const sub = currentSubject.value;
      const qId = currentQuestion.value.id;
      if (!userEdits[sub]) userEdits[sub] = {};
      userEdits[sub][qId] = { ...editForm };
      saveData();
      isEditing.value = false;
      
      currentQuestion.value.q = editForm.q;
      currentQuestion.value.a = editForm.a;
      currentQuestion.value.note = editForm.note;
      
      ElementPlus.ElMessage.success('保存成功');
    };

    const cancelEdit = () => {
      isEditing.value = false;
    };

    // 随机抽查
    const randomCurrent = () => {
      const list = mergedQuestions.value;
      if (list.length === 0) return;
      const randomIndex = Math.floor(Math.random() * list.length);
      selectQuestion(list[randomIndex]);
    };

    const randomWrong = () => {
      const list = mergedQuestions.value.filter(q => q.progress.wrong);
      if (list.length === 0) {
        ElementPlus.ElMessage.warning('当前科目没有错题');
        return;
      }
      const randomIndex = Math.floor(Math.random() * list.length);
      selectQuestion(list[randomIndex]);
    };

    const randomAll = () => {
      const allQuestions = [];
      subjects.value.forEach(sub => {
        const base = window.myData[sub] || [];
        const added = userAddedData[sub] || [];
        const edits = userEdits[sub] || {};
        const progress = userProgress[sub] || {};
        
        [...base, ...added].forEach(q => {
          if (!(edits[q.id] && edits[q.id].deleted)) {
            allQuestions.push({
              subject: sub,
              question: {
                ...q,
                ...(edits[q.id] || {}),
                progress: progress[q.id] || { mastery: '', wrong: false, finished: false, reviewCount: 0 }
              }
            });
          }
        });
      });
      
      if (allQuestions.length === 0) return;
      const randomIndex = Math.floor(Math.random() * allQuestions.length);
      const target = allQuestions[randomIndex];
      
      currentSubject.value = target.subject;
      setTimeout(() => {
        selectQuestion(target.question);
      }, 50);
    };

    const getMasteryClass = (mastery) => {
      if (mastery === '不会') return 'mastery-0';
      if (mastery === '不熟悉') return 'mastery-1';
      if (mastery === '熟悉') return 'mastery-2';
      return '';
    };

    return {
      subjects,
      currentSubject,
      filteredQuestions,
      currentQuestion,
      subjectProgress,
      searchText,
      showOnlyWrong,
      showAnswer,
      isEditing,
      editForm,
      currentPractice,
      currentNote,
      showAddModal,
      batchText,
      
      importBackup,
      exportBackup,
      selectSubject,
      selectQuestion,
      addSubject,
      confirmAddQuestions,
      deleteQuestion,
      toggleWrong,
      setMastery,
      incrementReviewCount,
      updateReviewCount,
      startEdit,
      saveEdit,
      cancelEdit,
      randomCurrent,
      randomWrong,
      randomAll,
      getMasteryClass
    };
  }
});

app.use(ElementPlus);
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}
app.mount('#app');
