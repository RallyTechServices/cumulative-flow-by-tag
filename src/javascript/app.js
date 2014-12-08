Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    items: [
       {xtype:'container',itemId:'control_box',layout: {type:'hbox'}, padding: 10},
       {xtype:'container',itemId:'summary_box',layout: {type:'vbox'}, 
                     padding: 10, 
                     tpl: '{Msg} % of Total Points Completed',
                     emptyText: '',
                     flex: 1},
        {xtype:'container',itemId:'display_box'},
        {xtype:'tsinfolink'}
    ],
    /*
     * preliminaryEstimateMap:  Hash maps PreliminaryEstimate ObjectIDs to corresponding values
     */
    preliminaryEstimateMap: [],
    /*
     * portfolioItemTypes:  Array of PortfolioItem TypePaths, in order of ordinal (LowestLevel Ordinal = 0)
     */
    
    portfolioItemTypes: [],
    /*
     * portfolioitemStateDone: The state that defines "done" for lowest level portfolio items.  This is the state that is used to determine
     *                         whether to use the LeafStoryPlanEstimateTotal or the PreliminaryEstimate
     */
    portfolioItemStateDone: 'Done',
    portfolioItemStateName: 'State',
    /*
     * stateFieldValues: Field values for the ScheduleState in HierarchicalRequirements to be displayed in the chart
     */
    stateFieldValues: ['Defined','In-Progress','Completed','Accepted'],
    /*
     * selectedPortfolioItemIds: Array holds the currently selected portfolio item ids.
     */
    selectedPortfolioItemIds: [],
    
    launch: function() {
        Ext.create('CumulativeFlowCalculator',{});
        
        //Initialize the PortfolioItem types and PreliminaryEstimate object ids before loading.  
        var promises = [];
        promises.push(this._fetchPortfolioItemTypes());
        promises.push(this._fetchPreliminaryEstimateMap());
        Deft.Promise.all(promises).then({
            scope: this,
            success: function(){
                this._addControls();
            }
        });
    },
    _addControls: function(){
        var min_dropdown_width = 300; 
        var label_width = 100;
        this.down('#control_box').add({
            xtype: 'container',
            layout: {type: 'vbox'},
            items: [{
                xtype: 'rallytagpicker',
                itemId: 'tag-picker',
                alwaysExpanded: false,
                autoExpand: false, 
                minWidth: min_dropdown_width + label_width,
                fieldLabel: 'Tags',
                labelWidth: label_width,
                labelAlign: 'right',
                storeConfig: {
                    sorters: [{
                        property: 'Name',
                        direction: 'ASC'
                    }],
                    filters: [{
                        property: 'Archived',
                        value: false
                    }]
                },
                listeners: {
                    scope: this,
                    selectionchange: this._updateTagLabel
                },
                _onBlur: function () {
                    if (this.toolTip) {
                        this.toolTip.destroy();
                    }
                    this.collapse();
                }
            },{
                xtype: 'textarea',
                itemId: 'tags-label',
                width: min_dropdown_width,
                fieldLabel: 'Match Any of the following Tags:',
                border: false,
                labelWidth: label_width,
                labelAlign: 'top',
                value: 'No Tags selected.',
                margin: '0 0 15 105',
                fieldStyle: {color: 'gray'},
                hidden: true
            }]
       });
        
       this.down('#control_box').add({
            xtype: 'container',
            layout: {type: 'vbox'},
            items: [{
                xtype: 'rallytextfield',
                itemId: 'selected-portfolio-item',
                width: min_dropdown_width,
                emptyText: 'Select Portfolio Item',
                height: 25,
                readOnly: true,
                fieldLabel: 'Portfolio Item',
                labelWidth: label_width,
                width: 400,
                labelAlign: 'right'
            },{
                xtype: 'rallycheckboxfield',
                itemId: 'chk-restrict',
                value: false,
                boxLabel: 'Restrict to Portfolio Item Hierarchy',
                margin: '0 0 0 110',
            }]
        });
        
       this.down('#control_box').add({ 
           xtype: 'rallybutton',
           text: 'Select...',
           scope: this,
           margin: '0 0 0 10',
           handler: this._selectPortfolioItems
      });
       this.down('#control_box').add({
           xtype: 'rallybutton',
           text: 'Update',
           margin: '0 0 0 20',
           scope: this,
           handler: this._run
       });
    },
    _updateQuerySummary: function(data){
        this.down('#query-summary').update(data);
    },
    _fetchPortfolioItemTypes: function(){
        var deferred = Ext.create('Deft.Deferred');
        
        Ext.create('Rally.data.wsapi.Store',{
            model: 'TypeDefinition',
            fetch: ['TypePath','Ordinal'],
            autoLoad: true, 
            filters: [{
                property: 'TypePath',
                operator: 'contains',
                value: 'PortfolioItem/'
            }],
            listeners: {
                scope: this,
                load: function(store, data, success){
                    this.portfolioItemTypes = new Array(data.length);
                    Ext.each(data, function(d){
                        //Use ordinal to make sure the lowest level portfolio item type is the first in the array.  
                        var idx = Number(d.get('Ordinal'));
                        this.portfolioItemTypes[idx] = d.get('TypePath');
                    }, this);
                    deferred.resolve(); 
                }
            }
        });
        return deferred.promise; 
    },
    _fetchPreliminaryEstimateMap: function(){
        var deferred = Ext.create('Deft.Deferred');
        Ext.create('Rally.data.wsapi.Store',{
            model: 'PreliminaryEstimate',
            fetch: ['ObjectID','Name','Value'],
            autoLoad: true, 
            listeners: {
                scope: this,
                load: function(store, data, success){
                    this.preliminaryEstimateMap = {};
                    Ext.each(data, function(d){
                        this.preliminaryEstimateMap[d.get('ObjectID')] = d.get('Value');
                    }, this);
                    deferred.resolve(); 
                }
            }
        });
        return deferred.promise; 
    },
    _selectPortfolioItems: function(){
        
        Ext.create('Rally.ui.dialog.SolrArtifactChooserDialog', {
            artifactTypes: ['portfolioitem'],
            autoShow: true,
            height: 400,
            resizable: true,
            title: 'Choose Portfolio Items',
            storeConfig: {
                fetch: ['FormattedID','Name','ObjectID','PlannedEndDate','PlannedStartDate'],
                pageSize: 200
            },
            listeners: {
                artifactchosen: function(ac, selectedRecord){
                    this.selectedPortfolioItemRecord = selectedRecord;
                    this.down('#selected-portfolio-item').setValue(selectedRecord.get('FormattedID') + ':' + selectedRecord.get('Name'));
                },
                scope: this
            }
         });
    },
   /*
    * _validate: Validates that we have the start and planned end dates for the chart and also that the chart has at least a tag or a 
    *            PortfolioItem hierarchy restriction. 
    */
    _validate: function(){
        if (this._getStartDate() == null || this._getEndDate() == null){
            alert('Please select a PortfolioItem with a PlannedStartDate and PlannedEndDate.');
            return false;  
        }
        if (this._getTagObjectIDs().length ==0){
            if (!this._isPortfolioItemRestricted()){
                alert('Please select at least 1 tag or restrict the PortfolioItem hierarchy to the selected PortfolioItem.');
                return false; 
            }
        }
        return true; 
    },
    _isPortfolioItemRestricted: function(){
        return this.down('#chk-restrict').getValue();
    },
    _getPortfolioItemIDs: function(){
        var pids = [];  
        if (this._isPortfolioItemRestricted()){
            pids.push(this.selectedPortfolioItemRecord.get('ObjectID'));
        }
        return pids;  
    },
    _getLowestLevelPortfolioItemType: function(){
        return this.portfolioItemTypes[0];
    },
    _getStartDate: function(){
        return this._getDate('PlannedStartDate');
    },
    _getEndDate: function(){
        return this._getDate('PlannedEndDate');
    },
    _getDate: function(field){
        this.logger.log('_getDate',field, this.selectedPortfolioItemRecord);
        if (this.selectedPortfolioItemRecord){
            var d = this.selectedPortfolioItemRecord.get(field);
            if (d){
                return new Date(d);
            }
        }
        return null;
    },
    _run: function(){
        this.logger.log('_run');
        
        if (!this._validate()){
            return; 
        }
        
        var tags = this._getTagObjectIDs(); 
        var pids = this._getPortfolioItemIDs();

        this._fetchPortfolioItemData(tags, pids).then({
            scope:this,
            success: function(data){
                this.logger.log('_run Success', data);
                var portfolioItemIds = this._getPortfolioItemIds(data);
                this._createChart(portfolioItemIds);
            },
            failure: function(error, success){
                alert(error);
            }
        });
    },
    _getPortfolioItemIds: function(data){
        //Now parse through the data to get the portfolio item object ids that we want
        var pids = [];
        Ext.each(data, function(d){
            var pi_type = d.get('_TypeHierarchy').slice(-1)[0];
            if (pi_type == this._getLowestLevelPortfolioItemType()){
                pids.push(d.get('ObjectID'));
            }
         },this);
         return pids;
    },
    _createChart: function(portfolioItemIds){
        this.logger.log('_createChart',portfolioItemIds, this._getStartDate(),this._getEndDate());
        
        var startDate = this._getStartDate();
        var endDate = this._getEndDate(); 
        var lowest_pi = this._getLowestLevelPortfolioItemType();
        var pi_state_name = this.portfolioItemStateName;
        var pi_state_done = this.portfolioItemStateDone;
        
        if (this.down('#rally-chart')){
            this.down('#rally-chart').destroy();
        }
        
        this.down('#display_box').add({
            xtype: 'rallychart',
            itemId: 'rally-chart',
            calculatorType: 'CumulativeFlowCalculator',
            storeType: 'Rally.data.lookback.SnapshotStore',
            storeConfig: this._getStoreConfig(portfolioItemIds),
            calculatorConfig: {
                stateFieldName: 'ScheduleState',
                stateFieldValues: this.stateFieldValues,
                startDate: startDate,
                endDate: endDate,
                lowestLevelPortfolioItemType: lowest_pi,
                portfolioItemStateDone: pi_state_done,
                portfolioItemStateName: pi_state_name,
                preliminaryEstimateMap: this.preliminaryEstimateMap
            },
            chartConfig: this._getChartConfig(),
            listeners: {
                scope: this,
                readyToRender: function(chart){
                    chart.chartConfig.subtitle.text = chart.calculator.getPercentCompleted(); 
                }
            }
        });    
    },

    _getChartConfig: function(){
        
        return {
            chart: {
                zoomType: 'xy'
            },
            height: 600,
            title: {
                text: 'Cumulative Flow by Tags'
            },
            subtitle: {
                text: ''
            },
            xAxis: {
                tickmarkPlacement: 'on',
                tickInterval: 7,
            },
            yAxis: [
                {
                    title: {
                        text: 'Points'
                    }
                }
            ],
            plotOptions: {
                series: {
                    marker: { enabled: false },
                    stacking: 'normal'
                },
                line: {
                    connectNulls: true,
                    stacking: 'null'
                }
            }
        };
        
    },
    
    _fetchPortfolioItemData: function(tags, pids){
        this.logger.log('_fetchPortfolioItemData', tags, pids);
        var deferred = Ext.create('Deft.Deferred');
        var portfolio_item_ids = [];
        var top_level_pis = [];
        var find_obj = {
                _TypeHierarchy: {$in: this.portfolioItemTypes},
                __At: "current",
                _ProjectHierarchy: this.getContext().getProject().ObjectID
            };
        if (tags.length > 0) {
            find_obj.Tags = {$in: tags};
        }
        if (pids.length > 0) {
            find_obj._ItemHierarchy = {$in: pids};
        }
        
        Ext.create('Rally.data.lookback.SnapshotStore', {
            listeners: {
                scope: this,
                load: function(store, data, success) {
                    if (success) {
                        deferred.resolve(data);
                    } else {
                        deferred.reject('Error getting associated Portfolio Items', success);
                    }
                }
            },
            autoLoad: true,
            fetch: ['ObjectID', 'FormattedID','Name','_ItemHierarchy','_TypeHierarchy','LeafStoryPlanEstimateTotal','PreliminaryEstimate','PlannedStartDate','PlannedEndDate',this.portfolioItemStateName],
            hydrate: ['State','PreliminaryEstimate','_TypeHierarchy'],
            find: find_obj
        });
        return deferred; 
    },

    _getTagObjectIDs: function(){
        var tag_objects = this.down('#tag-picker').getValue(); 
        var tags = [];
        Ext.each(tag_objects, function(to){
            tags.push(to.get('ObjectID'));
        },this);
        return tags; 
    },
    
    _getStoreConfig: function(portfolioItemObjectIds){
        this.logger.log('_getStoreConfig', portfolioItemObjectIds);
        return {
            find: {
                _TypeHierarchy: {$in: ['HierarchicalRequirement', this._getLowestLevelPortfolioItemType()]},
                Children: null,
                _ProjectHierarchy: this.getContext().getProject().ObjectID,
                _ItemHierarchy: {$in: portfolioItemObjectIds}
             },
            fetch: ['ScheduleState','PlanEstimate','_TypeHierarchy','_ValidTo','_ValidFrom','PreliminaryEstimate',this.portfolioItemStateName,'LeafStoryPlanEstimateTotal'],
            hydrate: ['ScheduleState','_TypeHierarchy',this.portfolioItemStateName],
            compress: true,
            sort: {
                _ValidFrom: 1
            },
            context: this.getContext().getDataContext(),
            limit: Infinity
        };
    },
    
    _updateTagLabel: function(picker, values, evt){
        var tag_text = ''
        Ext.each(values, function(v){
            tag_text += v.get('Name') + ', ';
        },this);
        tag_text = tag_text.replace(/(, $)/, "")
        if (tag_text.length > 0){
            this.down('#tags-label').show();
            this.down('#tags-label').setValue(tag_text); 
        } else {
            this.down('#tags-label').hide();
        }
    }
});